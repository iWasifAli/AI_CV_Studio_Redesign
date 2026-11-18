import { clearWorkspaceCaches } from './clear-caches';
import type { WorkspaceSession } from './model';
import type { WorkspaceStore } from './store';

export type ExitReport = { hasWork: boolean; problem?: string };
export type ExitMessage = {
  from: string;
  request: string;
  type: 'prepare' | 'ack' | 'cancel' | 'commit';
  report?: ExitReport;
  session?: WorkspaceSession;
};
export interface ExitTransport {
  peers(): string[];
  send(message: ExitMessage): void;
  listen(receive: (message: ExitMessage) => void): () => void;
  close(): void;
}
export interface AccountExitParticipant {
  prepare(): Promise<ExitReport>;
  cancel(): void;
  commit(): Promise<void>;
  exportRecovery(): Promise<void>;
}
const containsDrafts = (session: WorkspaceSession) => {
  if (session?.version !== 1 || !Array.isArray(session.tabs) || !Array.isArray(session.closedTabs))
    return true;
  return [...session.tabs, ...session.closedTabs].some(
    (tab) =>
      !tab ||
      Object.values(tab.features ?? {}).some((feature) => feature?.dirty) ||
      Object.values(tab.tasks ?? {}).some((task) => task?.status === 'running'),
  );
};

/** A missing acknowledgement is never interpreted as permission to erase another window. */
export class WorkspaceExitCoordinator {
  private readonly id: string;
  private request = '';
  private holds = new Map<string, string>();
  private replies = new Map<string, ExitMessage>();
  private wake: (() => void) | null = null;
  private off: () => void;
  constructor(
    private store: WorkspaceStore,
    private transport: ExitTransport,
    private flushCloud: () => Promise<void>,
    private ended: () => void = () => {},
    private timeoutMs = 1800,
  ) {
    this.id = store.getSnapshot().session.instanceId;
    this.off = transport.listen((message) => {
      void this.receive(message);
    });
  }
  private async local(): Promise<ExitReport> {
    this.store.freeze();
    let problem: string | undefined;
    try {
      await this.store.flush();
      await this.flushCloud();
    } catch {
      problem =
        'Some work could not be saved. Keep this window open, retry, or download a recovery copy.';
    }
    return { hasWork: this.store.hasUnsavedWork(), ...(problem ? { problem } : {}) };
  }
  private async receive(message: ExitMessage) {
    if (!message || message.from === this.id || !this.store.isLive()) return;
    if (message.type === 'prepare') {
      this.holds.set(message.from, message.request);
      const report = await this.local();
      this.transport.send({
        from: this.id,
        request: message.request,
        type: 'ack',
        report,
        session: this.store.getSnapshot().session,
      });
    } else if (message.type === 'ack' && message.request === this.request) {
      this.replies.set(message.from, message);
      this.wake?.();
    } else if (message.type === 'cancel') {
      if (this.holds.get(message.from) === message.request) this.holds.delete(message.from);
      this.store.freeze(this.holds.size > 0);
    } else if (message.type === 'commit') {
      this.store.invalidate({ preserve: false });
      void clearWorkspaceCaches(this.store.getSnapshot().session.ownerUid, [
        this.store.getSnapshot().session,
      ]).catch(() => {});
      this.ended();
    }
  }
  async prepare(): Promise<ExitReport> {
    this.request = crypto.randomUUID();
    this.holds.set(this.id, this.request);
    this.replies.clear();
    const peers = this.transport.peers();
    this.transport.send({ from: this.id, request: this.request, type: 'prepare' });
    const own = await this.local();
    if (peers.some((peer) => !this.replies.has(peer)))
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.wake = null;
          resolve();
        }, this.timeoutMs);
        this.wake = () => {
          if (peers.every((peer) => this.replies.has(peer))) {
            clearTimeout(timer);
            this.wake = null;
            resolve();
          }
        };
        this.wake();
      });
    let stored: WorkspaceSession[] = [];
    let problem = own.problem;
    try {
      stored = await this.store.persistence.list(this.store.getSnapshot().session.ownerUid);
    } catch {
      problem ??= 'Recovery storage is unavailable. Download a copy before leaving.';
    }
    if (peers.some((peer) => !this.replies.has(peer)))
      problem =
        'Another app window did not respond. Its latest work could not be checked. Return to that window or explicitly discard local work.';
    for (const reply of this.replies.values()) problem ??= reply.report?.problem;
    return {
      hasWork:
        own.hasWork ||
        stored.some(containsDrafts) ||
        [...this.replies.values()].some((r) => r.report?.hasWork),
      ...(problem ? { problem } : {}),
    };
  }
  cancel() {
    this.transport.send({ from: this.id, request: this.request, type: 'cancel' });
    this.holds.delete(this.id);
    this.store.freeze(this.holds.size > 0);
  }
  async commit() {
    const uid = this.store.getSnapshot().session.ownerUid;
    let sessions: WorkspaceSession[] = [];
    try {
      sessions = await this.recoverySessions();
      // This transaction prevents suspended windows from recreating erased snapshots on resume.
      await this.store.persistence.fence(uid);
    } finally {
      this.store.invalidate({ preserve: false });
      this.transport.send({ from: this.id, request: this.request, type: 'commit' });
    }
    await this.store.persistence.clear(uid);
    await clearWorkspaceCaches(uid, sessions);
  }

  async recoverySessions() {
    const sessions = await this.store.persistence
      .list(this.store.getSnapshot().session.ownerUid)
      .catch(() => []);
    const byId = new Map(
      sessions
        .filter(
          (session) =>
            session &&
            session.ownerUid === this.store.getSnapshot().session.ownerUid &&
            typeof session.instanceId === 'string',
        )
        .map((session) => [session.instanceId, session]),
    );
    for (const reply of this.replies.values())
      if (
        reply.session?.ownerUid === this.store.getSnapshot().session.ownerUid &&
        typeof reply.session.instanceId === 'string'
      )
        byId.set(reply.session.instanceId, reply.session);
    const current = this.store.getSnapshot().session;
    byId.set(current.instanceId, current);
    return [...byId.values()];
  }
  dispose() {
    this.off();
    this.transport.close();
  }
}

/** Window manifests deliberately survive a crash: a sleeping or crashed peer is unknown. */
export function browserExitTransport(
  uid: string,
  id: string,
  saved: () => boolean = () => false,
): ExitTransport {
  const prefix = `cvstudio:workspace-peer:${uid}:`;
  const key = prefix + id;
  const fallbackKey = `cvstudio:workspace-exit:${uid}`;
  const channel =
    typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel(`cvstudio:workspace-exit:${uid}`);
  const register = () => {
    try {
      localStorage.setItem(key, '1');
    } catch {}
  };
  const leaving = (event: PageTransitionEvent) => {
    if (!event.persisted && saved()) {
      try {
        localStorage.removeItem(key);
      } catch {}
    }
  };
  register();
  window.addEventListener('pageshow', register);
  window.addEventListener('pagehide', leaving);
  return {
    peers() {
      const peers: string[] = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const candidate = localStorage.key(i);
          if (candidate?.startsWith(prefix) && candidate !== key)
            peers.push(candidate.slice(prefix.length));
        }
      } catch {
        peers.push('unavailable-window-registry');
      }
      return peers;
    },
    send(message) {
      if (channel) channel.postMessage(message);
      else {
        try {
          localStorage.setItem(
            fallbackKey,
            JSON.stringify({ ...message, session: undefined, nonce: crypto.randomUUID() }),
          );
        } catch {}
      }
    },
    listen(receive) {
      const onMessage = (event: MessageEvent<ExitMessage>) => receive(event.data);
      const onStorage = (event: StorageEvent) => {
        if (event.key !== fallbackKey || !event.newValue) return;
        try {
          receive(JSON.parse(event.newValue) as ExitMessage);
        } catch {}
      };
      channel?.addEventListener('message', onMessage);
      window.addEventListener('storage', onStorage);
      return () => {
        channel?.removeEventListener('message', onMessage);
        window.removeEventListener('storage', onStorage);
      };
    },
    close() {
      channel?.close();
      window.removeEventListener('pageshow', register);
      window.removeEventListener('pagehide', leaving);
      try {
        localStorage.removeItem(key);
      } catch {}
    },
  };
}
