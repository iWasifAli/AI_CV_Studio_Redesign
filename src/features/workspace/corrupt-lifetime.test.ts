import { expect, it, vi } from 'vitest';
import { WorkspaceStore } from './store';
import { MemoryWorkspacePersistence } from './storage';
import { WorkspaceExitCoordinator, type ExitMessage } from './lifecycle';
import type { WorkspaceSession } from './model';

it('invalidates and broadcasts even if recovery enumeration contains a corrupt record', async () => {
  const persistence = new MemoryWorkspacePersistence();
  const store = await WorkspaceStore.open('u', persistence, null, '/studio');
  const messages: ExitMessage[] = [];
  const exit = new WorkspaceExitCoordinator(
    store,
    {
      peers: () => [],
      send: (m) => {
        messages.push(m);
      },
      listen: () => () => {},
      close() {},
    },
    async () => {},
  );
  try {
    // IndexedDbWorkspacePersistence.list currently permits decoded null data through its cast.
    vi.spyOn(persistence, 'list').mockResolvedValue([null as unknown as WorkspaceSession]);
    await exit.commit().catch(() => {});
    expect(store.isLive()).toBe(false);
    expect(messages.some((m) => m.type === 'commit')).toBe(true);
  } finally {
    exit.dispose();
    store.invalidate({ preserve: false });
  }
});
