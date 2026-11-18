import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Exercise provider callbacks across renders without a DOM. Effects (including cloud IO)
// are deliberately excluded: these assertions cover synchronous ownership transitions.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, owner: vi.fn() }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots))
      hooks.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [
      hooks.slots[index],
      (next: unknown) => {
        hooks.slots[index] = typeof next === 'function' ? next(hooks.slots[index]) : next;
      },
    ];
  },
  useRef(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useCallback: (callback: unknown) => callback,
  useMemo: (compute: () => unknown) => compute(),
  useEffect() {},
}));
vi.mock('@/modules/storage/repository', () => ({
  setRepositoryOwner: hooks.owner,
  getRepository: vi.fn(),
}));
vi.mock('./firebase-client', () => ({ clearClientSession: vi.fn(), signOutEverywhere: vi.fn() }));
vi.mock('./sync', () => ({ CloudSync: vi.fn() }));
vi.mock('@/components/ui/dialog', () => ({ Dialog: () => null }));
vi.mock('@/components/ui/button', () => ({ Button: () => null }));
vi.mock('@/i18n/client', () => ({ useT: () => (text: string) => text }));
vi.mock('@/features/workspace/recovery', () => ({ downloadWorkspaceRecovery: vi.fn() }));

import { AccountProvider, type AccountUser, useAccount } from './account-context';
import { ACCOUNT_SESSION_KEY } from './local-identity';

const verified: AccountUser = {
  uid: 'account-a',
  email: null,
  name: null,
  emailVerified: false,
  picture: null,
  admin: false,
};
function render() {
  hooks.cursor = 0;
  return AccountProvider({ children: null }).props.value as ReturnType<typeof useAccount>;
}
beforeEach(() => {
  hooks.slots = [];
  hooks.owner.mockClear();
  const storage = new Map([
    [ACCOUNT_SESSION_KEY, JSON.stringify({ uid: verified.uid, nonce: 'known' })],
  ]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('navigator', { onLine: false });
});
afterEach(() => vi.unstubAllGlobals());

it('retains the local owner while reconnect verification is pending', async () => {
  await render().refresh();
  expect(render().status).toBe('offline');
  let complete!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    ),
  );
  vi.stubGlobal('navigator', { onLine: true });
  hooks.owner.mockClear();
  const pending = render().refresh();
  const during = render();
  complete(Response.json({ user: verified }));
  await pending;
  expect(render().user?.uid).toBe(verified.uid);
  expect(during.user?.uid).toBe(verified.uid);
  expect(during.status).toBe('offline');
  expect(hooks.owner).not.toHaveBeenCalledWith(null);
});

it('clears local ownership after an authoritative signed-out response', async () => {
  await render().refresh();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ user: null })),
  );
  await render().refresh();
  expect(render().status).toBe('signedOut');
  expect(render().user).toBeNull();
  expect(localStorage.getItem(ACCOUNT_SESSION_KEY)).toBeNull();
});
