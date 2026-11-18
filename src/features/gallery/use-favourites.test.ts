import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Minimal hook lifecycle runner: preserve slots across renders and run cleanup before new effects.
const hooks = vi.hoisted(() => ({
  index: 0,
  slots: [] as { value?: unknown; deps?: unknown[]; cleanup?: () => void }[],
  effects: [] as (() => void)[],
  account: { status: 'signedIn', user: { uid: 'alice' } } as {
    status: string;
    user: { uid: string } | null;
  },
}));
vi.mock('react', () => {
  const changed = (a?: unknown[], b?: unknown[]) =>
    !a || !b || a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]));
  const memo = (fn: () => unknown, deps?: unknown[]) => {
    const slot = (hooks.slots[hooks.index++] ??= {});
    if (changed(slot.deps, deps)) {
      slot.value = fn();
      slot.deps = deps;
    }
    return slot.value;
  };
  const effect = (fn: () => void | (() => void), deps?: unknown[]) => {
    const slot = (hooks.slots[hooks.index++] ??= {});
    if (changed(slot.deps, deps)) {
      hooks.effects.push(() => {
        slot.cleanup?.();
        slot.cleanup = fn() || undefined;
      });
      slot.deps = deps;
    }
  };
  return {
    useState: (initial: unknown) => {
      const index = hooks.index++;
      const slot = (hooks.slots[index] ??= {
        value: typeof initial === 'function' ? initial() : initial,
      });
      return [
        slot.value,
        (next: unknown) => {
          slot.value = typeof next === 'function' ? next(slot.value) : next;
        },
      ];
    },
    useRef: (initial: unknown) => memo(() => ({ current: initial }), []),
    useMemo: memo,
    useCallback: (fn: unknown, deps?: unknown[]) => memo(() => fn, deps),
    useEffect: effect,
    useLayoutEffect: effect,
  };
});
vi.mock('@/features/account/account-context', () => ({ useAccount: () => hooks.account }));
import { useFavourites } from './use-favourites';
const fetch = vi.fn();
let local: Map<string, string>;
const render = () => {
  hooks.index = 0;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- this test runner supplies the hook lifecycle
  const result = useFavourites();
  hooks.effects.splice(0).forEach((effect) => effect());
  return result;
};
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const switchTo = (uid: string) => {
  hooks.account = { status: 'signedIn', user: { uid } };
  return render();
};
beforeEach(() => {
  hooks.index = 0;
  hooks.slots = [];
  hooks.effects = [];
  hooks.account = { status: 'signedIn', user: { uid: 'alice' } };
  local = new Map([['cv.design.favourites', '["guest"]']]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
  });
  vi.stubGlobal('fetch', fetch);
  fetch.mockReset().mockImplementation(async () => Response.json({ ids: ['server'] }));
});
afterEach(() => {
  hooks.slots.forEach((slot) => slot.cleanup?.());
  vi.unstubAllGlobals();
});

it('captures the owner on both the account read and guest merge', async () => {
  render();
  await settle();
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [, init] of fetch.mock.calls as [string, RequestInit][]) {
    expect(new Headers(init.headers).get('X-Workspace-Owner')).toBe('alice');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  }
  expect(render().ids).toEqual(['server', 'guest']);
  expect(local.get('cv.design.favourites')).toBe('[]');
});
it('never merges or clears guest favourites from a stale account read', async () => {
  let resolve!: (r: Response) => void;
  fetch.mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  render();
  const oldResolve = resolve;
  switchTo('bob');
  oldResolve(Response.json({ ids: ['alice-only'] }));
  await settle();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(local.get('cv.design.favourites')).toBe('["guest"]');
  expect(render().ids).not.toContain('alice-only');
});
it('keeps guest favourites if merge fails', async () => {
  fetch
    .mockResolvedValueOnce(Response.json({ ids: ['server'] }))
    .mockResolvedValueOnce(new Response('{}', { status: 403 }));
  render();
  await settle();
  expect(local.get('cv.design.favourites')).toBe('["guest"]');
});
it('does not clear guest favourites when the merge finishes after an account switch', async () => {
  let resolve!: (r: Response) => void;
  fetch
    .mockResolvedValueOnce(Response.json({ ids: ['alice-only'] }))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    )
    .mockImplementation(() => new Promise(() => {}));
  render();
  await settle();
  switchTo('bob');
  resolve(Response.json({ ok: true }));
  await settle();
  expect(local.get('cv.design.favourites')).toBe('["guest"]');
});
it('makes a stale toggle inert and captures the replacement owner on new toggles', async () => {
  local.set('cv.design.favourites', '[]');
  render();
  await settle();
  const old = render();
  switchTo('bob');
  await settle();
  const current = render();
  fetch.mockClear();
  old.toggle('alice-late');
  expect(fetch).not.toHaveBeenCalled();
  current.toggle('bob-new');
  await settle();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(new Headers(fetch.mock.calls[0]![1].headers).get('X-Workspace-Owner')).toBe('bob');
  expect(render().ids).toEqual(['bob-new', 'server']);
});
it('keeps signed-out favourites local', async () => {
  hooks.account = { status: 'signedOut', user: null };
  render();
  render().toggle('local-new');
  expect(fetch).not.toHaveBeenCalled();
  expect(JSON.parse(local.get('cv.design.favourites')!)).toEqual(['local-new', 'guest']);
});

it('ignores an old account body that resolves after the response headers', async () => {
  let resolve!: (body: { ids: string[] }) => void;
  fetch
    .mockResolvedValueOnce({
      ok: true,
      json: () =>
        new Promise<{ ids: string[] }>((done) => {
          resolve = done;
        }),
    })
    .mockImplementation(() => new Promise(() => {}));
  render();
  await settle();
  switchTo('bob');
  resolve({ ids: ['alice-only'] });
  await settle();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(local.get('cv.design.favourites')).toBe('["guest"]');
  expect(render().ids).not.toContain('alice-only');
});
