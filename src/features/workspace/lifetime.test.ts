import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceStore } from './store';
import { IndexedDbWorkspacePersistence, MemoryWorkspacePersistence } from './storage';
import { WorkspaceExitCoordinator, type ExitMessage, type ExitTransport } from './lifecycle';

const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
});
async function open(
  persistence = new MemoryWorkspacePersistence(),
  previous: string | null = null,
) {
  const store = await WorkspaceStore.open('u', persistence, previous, '/studio');
  cleanup.push(() => store.invalidate());
  return store;
}
const idle: ExitTransport = { peers: () => [], send() {}, listen: () => () => {}, close() {} };
function coordinator(store: WorkspaceStore, transport = idle) {
  const c = new WorkspaceExitCoordinator(
    store,
    transport,
    async () => {},
    () => {},
    5,
  );
  cleanup.push(() => c.dispose());
  return c;
}

describe('review regressions: expected requirements', () => {
  it('retains the latest dirty snapshot for owner recovery after forced invalidation', async () => {
    const p = new MemoryWorkspacePersistence();
    const a = await open(p);
    const { instanceId, activeTabId } = a.getSnapshot().session;
    a.writeFeature(activeTabId, 'draft', 'last keystroke', true);
    a.invalidate();
    await a.flush();
    const recovered = await open(p, instanceId);
    expect(recovered.readFeature(activeTabId, 'draft')).toBe('last keystroke');
  });

  it('keeps a newer preflight frozen when an older request sends cancel', async () => {
    const a = await open();
    let receive!: (message: ExitMessage) => void;
    const sent: ExitMessage[] = [];
    coordinator(a, {
      ...idle,
      listen: (fn) => {
        receive = fn;
        return () => {};
      },
      send: (m) => {
        sent.push(m);
      },
    });
    receive({ from: 'peer1', request: 'old', type: 'prepare' });
    await vi.waitFor(() => expect(sent.some((m) => m.request === 'old')).toBe(true));
    receive({ from: 'peer2', request: 'new', type: 'prepare' });
    await vi.waitFor(() => expect(sent.some((m) => m.request === 'new')).toBe(true));
    receive({ from: 'peer1', request: 'old', type: 'cancel' });
    expect(a.getSnapshot().frozen).toBe(true);
  });

  it('invalidates local and peer lifetimes even when the signout storage fence fails', async () => {
    const p = new MemoryWorkspacePersistence();
    const a = await open(p);
    const b = await open(p);
    const listeners = new Map<string, (m: ExitMessage) => void>();
    const network = (id: string): ExitTransport => ({
      peers: () => [...listeners.keys()].filter((k) => k !== id),
      listen: (fn) => {
        listeners.set(id, fn);
        return () => {
          listeners.delete(id);
        };
      },
      send: (m) => {
        for (const [key, fn] of listeners) if (key !== id) fn(m);
      },
      close() {},
    });
    const ca = coordinator(a, network(a.getSnapshot().session.instanceId));
    coordinator(b, network(b.getSnapshot().session.instanceId));
    await ca.prepare();
    vi.spyOn(p, 'fence').mockRejectedValue(new Error('storage unavailable'));
    await expect(ca.commit()).rejects.toThrow('storage unavailable');
    expect([a.isLive(), b.isLive()]).toEqual([false, false]);
  });
});

describe('review: storage and snapshot identity', () => {
  it('retries opening IndexedDB after a transient open failure', async () => {
    const open = vi.fn(() => {
      const request = {
        error: new Error('temporary failure'),
        onerror: null as null | (() => void),
      };
      queueMicrotask(() => request.onerror?.());
      return request;
    });
    vi.stubGlobal('indexedDB', { open });
    try {
      const persistence = new IndexedDbWorkspacePersistence();
      await expect(persistence.epoch('u')).rejects.toThrow('temporary failure');
      await expect(persistence.epoch('u')).rejects.toThrow('temporary failure');
      expect(open).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('isolates duplicate tab IDs in a corrupt saved session', async () => {
    const p = new MemoryWorkspacePersistence();
    const original = await open(p);
    const session = structuredClone(original.getSnapshot().session);
    session.tabs.push({ ...structuredClone(session.tabs[0]!), href: '/makeover' });
    await p.save(session);
    original.invalidate();
    const restored = await open(p, session.instanceId);
    const ids = restored.getSnapshot().session.tabs.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not mark newer input clean when an earlier save completes', async () => {
    const store = await open();
    const tab = store.active().id;
    store.writeFeature(tab, '/portfolio:portfolio.name', 'submitted value', true);
    const submitted = store.getTab(tab)!.features;
    // An explicit save captures submitted value, then waits for its server response.
    store.writeFeature(tab, '/portfolio:portfolio.name', 'new unsaved edit', true);
    // The completion only acknowledges the captured snapshot.
    store.markClean(tab, '/portfolio:', submitted);
    expect(store.getTab(tab)?.features['/portfolio:portfolio.name']?.dirty).toBe(true);
  });
});
