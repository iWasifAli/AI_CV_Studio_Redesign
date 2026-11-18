import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { WorkspaceStore } from './store';
import { MemoryWorkspacePersistence } from './storage';
import { useWorkspaceRouter } from './navigation';

const mock = vi.hoisted(() => ({
  context: {} as { store: WorkspaceStore; tabId: string; routeKey: string },
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  },
}));
vi.mock('./context', () => ({ useWorkspace: () => mock.context }));
vi.mock('next/navigation', () => ({ useRouter: () => mock.router }));
vi.mock('next/link', () => ({ default: 'a' }));

it('keeps the user on their new route when an old route task navigates later in the same tab', async () => {
  const store = await WorkspaceStore.open('u', new MemoryWorkspacePersistence(), null, '/makeover');
  try {
    mock.context = { store, tabId: store.active().id, routeKey: '/makeover' };
    let originRouter!: ReturnType<typeof useWorkspaceRouter>;
    function Capture() {
      originRouter = useWorkspaceRouter();
      return null;
    }
    renderToString(createElement(Capture));
    // User moves elsewhere while the originating screen's operation is pending.
    store.navigate(store.active().id, '/jobs');
    // The task resolves and its captured workspace router opens the result.
    originRouter.push('/cv/generated');
    await store.flush();
    expect(mock.router.push).not.toHaveBeenCalled();
    expect(store.active().href).toBe('/jobs');
  } finally {
    store.invalidate();
  }
});

it('does not leave a global route when the previous workspace route task completes', async () => {
  mock.router.push.mockClear();
  const store = await WorkspaceStore.open('u', new MemoryWorkspacePersistence(), null, '/makeover');
  try {
    mock.context = { store, tabId: store.active().id, routeKey: '/makeover' };
    let originRouter!: ReturnType<typeof useWorkspaceRouter>;
    function Capture() {
      originRouter = useWorkspaceRouter();
      return null;
    }
    renderToString(createElement(Capture));
    // WorkspaceProvider updates routeKey for global pages but deliberately retains the tab href.
    mock.context = { ...mock.context, routeKey: '/account' };
    vi.stubGlobal('window', { location: { pathname: '/account' } });
    originRouter.push('/cv/generated');
    await store.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mock.router.push).not.toHaveBeenCalled();
    expect(store.active().href).toBe('/makeover');
  } finally {
    vi.unstubAllGlobals();
    store.invalidate({ preserve: false });
  }
});
