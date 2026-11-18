import {
  CLOSED_LIMIT,
  SAVE_DELAY,
  type FeatureSnapshot,
  type WorkspaceSession,
  type WorkspaceSnapshot,
  type WorkspaceTab,
} from './model';
import { sameSnapshotValue } from './equality';
import { registerWorkspaceSignal } from './request';
import { routeInfo, WORKSPACE_PARAM } from './routes';
import type { WorkspacePersistence } from './storage';

const id = () => crypto.randomUUID();
const recovery = new WeakMap<WorkspacePersistence, Map<string, WorkspaceSession>>();
function recoveries(persistence: WorkspacePersistence) {
  let sessions = recovery.get(persistence);
  if (!sessions) recovery.set(persistence, (sessions = new Map()));
  return sessions;
}
const aborted = () => new DOMException('This workspace session has ended.', 'AbortError');
const trimClosed = (tabs: WorkspaceTab[]) => {
  let complete = 0;
  return tabs.filter(
    (t) =>
      Object.values(t.tasks).some((task) => task.status === 'running') || complete++ < CLOSED_LIMIT,
  );
};
function makeTab(href: string): WorkspaceTab {
  const route = routeInfo(href) ?? routeInfo('/studio')!;
  return { ...route, id: id(), features: {}, tasks: {}, scroll: {} };
}
function restoreTab(raw: unknown): WorkspaceTab | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as WorkspaceTab;
  if (typeof t.id !== 'string' || t.id.length > 128 || typeof t.href !== 'string') return null;
  const route = routeInfo(t.href);
  if (!route) return null;
  const features: Record<string, FeatureSnapshot> = {};
  for (const [key, value] of Object.entries(t.features ?? {})) {
    if (
      value &&
      typeof value === 'object' &&
      value.version === 1 &&
      'value' in value &&
      key.length < 2048
    )
      features[key] = {
        ...value,
        dirty: value.dirty === true,
        // Clean snapshots already acknowledge this value. Restore that identity because
        // decoding two occurrences of a File can create two distinct File objects.
        ...(value.baseline && value.dirty !== true ? { baseline: { value: value.value } } : {}),
      };
  }
  const tasks: WorkspaceTab['tasks'] = {};
  for (const [key, task] of Object.entries(t.tasks ?? {})) {
    if (
      !task ||
      typeof task !== 'object' ||
      !['running', 'complete', 'error', 'interrupted'].includes(task.status)
    )
      continue;
    tasks[key] =
      task.status === 'running'
        ? {
            ...task,
            status: 'interrupted',
            message: 'Interrupted when the app closed. Check your saved work before retrying.',
          }
        : task;
  }
  return {
    ...route,
    id: t.id,
    title: typeof t.title === 'string' ? t.title.slice(0, 160) : route.title,
    features,
    tasks,
    scroll: t.scroll && typeof t.scroll === 'object' ? t.scroll : {},
  };
}

/** A controller outlives routed screens. Every callback is bound to a tab, never to the active tab. */
export class WorkspaceStore {
  private snapshot: WorkspaceSnapshot;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> | null = null;
  private persisted: WorkspaceSession | null = null;
  private recoveryWrite: Promise<void> | null = null;
  private live = true;
  private tasks = new Map<string, { controller: AbortController; promise: Promise<unknown> }>();
  private flushers = new Set<() => void | Promise<void>>();

  private constructor(
    session: WorkspaceSession,
    readonly persistence: WorkspacePersistence,
    private ownerEpoch: number,
  ) {
    this.snapshot = { session, persistence: 'saving', problem: null, frozen: false };
  }
  static async open(
    uid: string,
    persistence: WorkspacePersistence,
    previous: string | null,
    initialHref: string,
  ) {
    let raw: WorkspaceSession | null = null;
    let problem: string | null = null;
    let epoch = 0;
    try {
      [raw, epoch] = await Promise.all([persistence.load(uid, previous), persistence.epoch(uid)]);
    } catch {
      problem =
        'Workspace recovery is unavailable. Keep this window open until saving is available.';
    }
    const volatile = recoveries(persistence).get(uid);
    if (volatile && (!raw || volatile.updatedAt >= raw.updatedAt)) raw = volatile;
    const valid = raw?.version === 1 && raw.ownerUid === uid;
    if (raw && !valid)
      problem =
        'This saved workspace uses an unsupported format. Its recovery data has been kept on this device.';
    const tabs =
      valid && Array.isArray(raw?.tabs)
        ? raw!.tabs.map(restoreTab).filter((t): t is WorkspaceTab => !!t)
        : [];
    if (!tabs.length) tabs.push(makeTab('/studio'));
    const closedTabs =
      valid && Array.isArray(raw?.closedTabs)
        ? raw!.closedTabs.map(restoreTab).filter((t): t is WorkspaceTab => !!t)
        : [];
    const seen = new Set<string>();
    for (const tab of [...tabs, ...closedTabs]) {
      if (!tab.id || seen.has(tab.id)) tab.id = id();
      seen.add(tab.id);
    }
    const activeTabId = tabs.some((t) => t.id === raw?.activeTabId)
      ? raw!.activeTabId
      : tabs[0]!.id;
    const store = new WorkspaceStore(
      {
        version: 1,
        ownerUid: uid,
        instanceId: id(),
        activeTabId,
        tabs,
        closedTabs: trimClosed(closedTabs),
        updatedAt: Date.now(),
      },
      persistence,
      epoch,
    );
    const initial = routeInfo(initialHref);
    const requestedId = new URL(initialHref, 'https://workspace.invalid').searchParams.get(
      WORKSPACE_PARAM,
    );
    if (initial && (initial.href !== '/studio' || requestedId))
      store.visit(initialHref, requestedId);
    if (problem) store.snapshot = { ...store.snapshot, persistence: 'error', problem };
    else await store.flush().catch(() => {});
    return store;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    this.listeners.forEach((listener) => listener());
  }
  private change(session: WorkspaceSession) {
    if (!this.live) return;
    this.snapshot = {
      ...this.snapshot,
      session: { ...session, updatedAt: Date.now() },
      persistence: 'saving',
    };
    this.emit();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush().catch(() => {});
    }, SAVE_DELAY);
  }
  getTab(tabId: string) {
    return [...this.snapshot.session.tabs, ...this.snapshot.session.closedTabs].find(
      (t) => t.id === tabId,
    );
  }
  private updateTab(tabId: string, update: (tab: WorkspaceTab) => WorkspaceTab) {
    const s = this.snapshot.session;
    this.change({
      ...s,
      tabs: s.tabs.map((t) => (t.id === tabId ? update(t) : t)),
      closedTabs: trimClosed(s.closedTabs.map((t) => (t.id === tabId ? update(t) : t))),
    });
  }
  active() {
    return this.snapshot.session.tabs.find((t) => t.id === this.snapshot.session.activeTabId)!;
  }
  add(href = '/studio') {
    if (!this.live || this.snapshot.frozen) return this.active();
    const route = routeInfo(href) ?? routeInfo('/studio')!;
    const existing =
      route.entityKey && this.snapshot.session.tabs.find((t) => t.entityKey === route.entityKey);
    if (existing) {
      this.activate(existing.id);
      return existing;
    }
    const tab = makeTab(route.href);
    this.change({
      ...this.snapshot.session,
      tabs: [...this.snapshot.session.tabs, tab],
      activeTabId: tab.id,
    });
    return tab;
  }
  activate(tabId: string) {
    if (!this.snapshot.session.tabs.some((t) => t.id === tabId) || this.snapshot.frozen) return;
    this.change({ ...this.snapshot.session, activeTabId: tabId });
  }
  /** Browser history can revisit a closed tab; unknown identifiers are never trusted as owners. */
  visit(href: string, preferredId?: string | null) {
    const route = routeInfo(href);
    if (!route || !this.live || this.snapshot.frozen) return this.active();
    if (preferredId && this.snapshot.session.closedTabs.some((t) => t.id === preferredId))
      this.reopen(preferredId);
    const s = this.snapshot.session;
    const duplicate = route.entityKey && s.tabs.find((t) => t.entityKey === route.entityKey);
    const target =
      duplicate ||
      s.tabs.find((t) => t.id === preferredId) ||
      (preferredId ? this.add(href) : this.active());
    this.updateTab(target.id, (t) => ({
      ...t,
      ...route,
      title: t.entityKey === route.entityKey && route.entityKey ? t.title : route.title,
    }));
    this.activate(target.id);
    return this.getTab(target.id)!;
  }
  /** Inactive task navigation changes only its originating tab's saved destination. */
  navigate(tabId: string, href: string) {
    const route = routeInfo(href);
    const origin = this.getTab(tabId);
    if (!origin || !route || !this.live || this.snapshot.frozen) return null;
    const active = this.snapshot.session.activeTabId === tabId;
    const duplicate =
      route.entityKey &&
      this.snapshot.session.tabs.find((t) => t.entityKey === route.entityKey && t.id !== tabId);
    if (duplicate) {
      if (active) this.activate(duplicate.id);
      return active ? duplicate : null;
    }
    this.updateTab(tabId, (t) => ({ ...t, ...route }));
    return active ? this.getTab(tabId)! : null;
  }
  close(tabId: string) {
    if (this.snapshot.frozen) return;
    const s = this.snapshot.session;
    const index = s.tabs.findIndex((t) => t.id === tabId);
    const tab = s.tabs[index];
    if (!tab) return;
    const tabs = s.tabs.filter((t) => t.id !== tabId);
    if (!tabs.length) tabs.push(makeTab('/studio'));
    const activeTabId =
      s.activeTabId === tabId ? tabs[Math.min(index, tabs.length - 1)]!.id : s.activeTabId;
    this.change({
      ...s,
      tabs,
      activeTabId,
      closedTabs: trimClosed([tab, ...s.closedTabs.filter((t) => t.id !== tabId)]),
    });
  }
  reopen(tabId?: string) {
    const s = this.snapshot.session;
    const tab = tabId ? s.closedTabs.find((t) => t.id === tabId) : s.closedTabs[0];
    if (!tab || this.snapshot.frozen) return null;
    const duplicate = tab.entityKey && s.tabs.find((t) => t.entityKey === tab.entityKey);
    if (duplicate) {
      this.activate(duplicate.id);
      return duplicate;
    }
    this.change({
      ...s,
      tabs: [...s.tabs, tab],
      closedTabs: s.closedTabs.filter((t) => t.id !== tab.id),
      activeTabId: tab.id,
    });
    return tab;
  }
  setTitle(tabId: string, title: string) {
    if (this.getTab(tabId)?.title === title) return;
    this.updateTab(tabId, (t) => ({ ...t, title: title.slice(0, 160) }));
  }
  readFeature(tabId: string, key: string) {
    return this.getTab(tabId)?.features[key]?.value;
  }
  hasFeature(tabId: string, key: string) {
    return !!this.getTab(tabId)?.features[key];
  }
  writeFeature(
    tabId: string,
    key: string,
    value: unknown,
    dirty = false,
    initialBaseline?: FeatureSnapshot['baseline'],
  ) {
    if (!this.live || !this.getTab(tabId)) return;
    const prior = this.getTab(tabId)!.features[key];
    // Opt-in keeps large derived snapshots (such as editor history) single-valued.
    // A legacy clean snapshot is acknowledged; a dirty legacy draft uses the hook default.
    const baseline =
      prior?.baseline ??
      (initialBaseline && { value: prior && !prior.dirty ? prior.value : initialBaseline.value });
    const nextDirty = baseline
      ? !sameSnapshotValue(value, baseline.value)
      : dirty || !!prior?.dirty;
    if (
      prior &&
      Object.is(prior.value, value) &&
      prior.dirty === nextDirty &&
      prior.baseline === baseline
    )
      return;
    this.updateTab(tabId, (t) => ({
      ...t,
      features: {
        ...t.features,
        [key]: {
          version: 1,
          value,
          dirty: nextDirty,
          updatedAt: Date.now(),
          ...(baseline ? { baseline } : {}),
        },
      },
    }));
  }
  markClean(tabId: string, prefix = '', expected?: Record<string, FeatureSnapshot>) {
    this.updateTab(tabId, (t) => ({
      ...t,
      features: Object.fromEntries(
        Object.entries(t.features).map(([key, f]) => {
          const acknowledged = expected ? expected[key] : f;
          if (!key.startsWith(prefix) || !acknowledged) return [key, f];
          const matches = acknowledged === f || sameSnapshotValue(acknowledged.value, f.value);
          // A completed save acknowledges its captured value, never subsequent input.
          // Updating the baseline still lets that subsequent input revert to the saved value.
          return [
            key,
            f.baseline
              ? { ...f, dirty: !matches, baseline: { value: acknowledged.value } }
              : matches
                ? { ...f, dirty: false }
                : f,
          ];
        }),
      ),
    }));
  }
  setScroll(tabId: string, key: string, position: { top: number; left: number }) {
    const previous = this.getTab(tabId)?.scroll[key];
    if (previous?.top === position.top && previous.left === position.left) return;
    this.updateTab(tabId, (t) => ({ ...t, scroll: { ...t.scroll, [key]: position } }));
  }
  registerFlusher(fn: () => void | Promise<void>) {
    this.flushers.add(fn);
    return () => {
      this.flushers.delete(fn);
    };
  }
  async flush() {
    if (!this.live) {
      await this.recoveryWrite;
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.live) return;
    for (const flush of this.flushers) await flush();
    if (this.writing) await this.writing;
    if (!this.live || this.persisted === this.snapshot.session) return;
    const session = this.snapshot.session;
    this.writing = this.persistence
      .save(session, this.ownerEpoch)
      .then(
        () => {
          this.persisted = session;
          if (this.live)
            this.snapshot = {
              ...this.snapshot,
              persistence: this.snapshot.session === session ? 'saved' : 'saving',
              problem: null,
            };
        },
        (error: unknown) => {
          if (this.live)
            this.snapshot = {
              ...this.snapshot,
              persistence: 'error',
              problem:
                'Could not save your workspace. Keep this window open or download a recovery copy.',
            };
          throw error;
        },
      )
      .finally(() => {
        this.writing = null;
        this.emit();
      });
    await this.writing;
    if (this.live && this.persisted !== this.snapshot.session) await this.flush();
  }
  runTask<T>(tabId: string, key: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (!this.live || this.snapshot.frozen || !this.getTab(tabId)) return Promise.reject(aborted());
    const taskKey = `${tabId}:${key}`;
    const existing = this.tasks.get(taskKey);
    if (existing) return existing.promise as Promise<T>;
    const controller = new AbortController();
    registerWorkspaceSignal(controller.signal, this.snapshot.session.ownerUid);
    const taskId = id();
    this.updateTab(tabId, (t) => ({
      ...t,
      tasks: { ...t.tasks, [key]: { id: taskId, status: 'running', startedAt: Date.now() } },
    }));
    const finish = (status: 'complete' | 'error', message?: string) => {
      if (!this.live) return;
      this.updateTab(tabId, (t) => ({
        ...t,
        tasks: { ...t.tasks, [key]: { ...t.tasks[key]!, status, ...(message ? { message } : {}) } },
      }));
    };
    let execution: Promise<T>;
    try {
      execution = work(controller.signal);
    } catch (error) {
      execution = Promise.reject(error);
    }
    const promise = execution
      .then(
        (result) => {
          if (!this.live || controller.signal.aborted) throw aborted();
          finish('complete');
          return result;
        },
        (error: unknown) => {
          if (!this.live || controller.signal.aborted) throw aborted();
          finish('error', error instanceof Error ? error.message : 'This operation failed.');
          throw error;
        },
      )
      .finally(() => {
        if (this.tasks.get(taskKey)?.controller === controller) this.tasks.delete(taskKey);
      });
    this.tasks.set(taskKey, { controller, promise });
    return promise;
  }
  hasUnsavedWork() {
    return [...this.snapshot.session.tabs, ...this.snapshot.session.closedTabs].some(
      (t) =>
        Object.values(t.features).some((f) => f.dirty) ||
        Object.values(t.tasks).some((task) => task.status === 'running'),
    );
  }
  freeze(frozen = true) {
    this.snapshot = { ...this.snapshot, frozen };
    this.emit();
  }
  isLive() {
    return this.live;
  }
  invalidate({ preserve = true }: { preserve?: boolean } = {}) {
    if (!this.live) return;
    const final = this.snapshot.session;
    this.live = false;
    if (this.timer) clearTimeout(this.timer);
    this.tasks.forEach((task) => task.controller.abort());
    this.snapshot = { ...this.snapshot, frozen: true };
    if (preserve && this.persisted !== final) {
      // Never run repository/cloud flushers under a replacement account. The already-captured
      // feature snapshots remain owned by the old account, including its last keystroke.
      recoveries(this.persistence).set(final.ownerUid, final);
      this.recoveryWrite = Promise.resolve(this.writing)
        .catch(() => {})
        .then(() => this.persistence.save(final, this.ownerEpoch))
        .then(() => {
          if (recoveries(this.persistence).get(final.ownerUid) === final)
            recoveries(this.persistence).delete(final.ownerUid);
        });
      void this.recoveryWrite.catch(() => {});
    } else if (!preserve) recoveries(this.persistence).delete(final.ownerUid);
    this.emit();
  }
}
