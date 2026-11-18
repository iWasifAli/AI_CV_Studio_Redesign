import { describe, expect, it } from 'vitest';
import { WorkspaceStore } from './store';
import { MemoryWorkspacePersistence } from './storage';
import { WorkspaceExitCoordinator, type ExitMessage, type ExitTransport } from './lifecycle';

function network() {
  const listeners = new Map<string, (message: ExitMessage) => void>();
  return (id: string): ExitTransport => ({
    peers: () => [...listeners.keys()].filter((key) => key !== id),
    send: (message) => {
      for (const [key, receive] of listeners) if (key !== id) receive(message);
    },
    listen: (receive) => {
      listeners.set(id, receive);
      return () => {
        listeners.delete(id);
      };
    },
    close() {},
  });
}

describe('workspace exit preflight', () => {
  it('includes drafts in another window and resumes both windows after cancellation', async () => {
    const persistence = new MemoryWorkspacePersistence();
    const a = await WorkspaceStore.open('u', persistence, null, '/studio');
    const b = await WorkspaceStore.open('u', persistence, null, '/jobs/new');
    b.writeFeature(b.active().id, 'draft', 'keep this', true);
    const connect = network();
    const ca = new WorkspaceExitCoordinator(
      a,
      connect(a.getSnapshot().session.instanceId),
      async () => {},
    );
    const cb = new WorkspaceExitCoordinator(
      b,
      connect(b.getSnapshot().session.instanceId),
      async () => {},
    );
    const result = await ca.prepare();
    expect(result.hasWork).toBe(true);
    expect(b.getSnapshot().frozen).toBe(true);
    ca.cancel();
    expect(a.getSnapshot().frozen).toBe(false);
    expect(b.getSnapshot().frozen).toBe(false);
    ca.dispose();
    cb.dispose();
    a.invalidate();
    b.invalidate();
  });

  it('treats an unresponsive window as unknown and fences writes before clearing', async () => {
    const persistence = new MemoryWorkspacePersistence();
    const store = await WorkspaceStore.open('u', persistence, null, '/studio');
    const old = store.getSnapshot().session;
    const exit = new WorkspaceExitCoordinator(
      store,
      { peers: () => ['sleeping-window'], send() {}, listen: () => () => {}, close() {} },
      async () => {},
      () => {},
      5,
    );
    const result = await exit.prepare();
    expect(result.problem).toContain('window');
    await exit.commit();
    await expect(persistence.save(old, 0)).rejects.toMatchObject({ name: 'AbortError' });
    expect(await persistence.list('u')).toEqual([]);
    exit.dispose();
  });
});
