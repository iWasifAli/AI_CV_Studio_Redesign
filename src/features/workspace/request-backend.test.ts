import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MemoryUserStore } from '@/modules/store/memory';
import { DESIGN_IDS } from '@/modules/resume/ids';
const state = vi.hoisted(() => ({
  uid: 'bob' as string | null,
  headers: new Headers(),
  store: null as unknown as MemoryUserStore,
  dispatched: vi.fn(),
}));
vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: () => ({
    verifySessionCookie: async () => {
      if (!state.uid) throw new Error('Revoked session');
      return { uid: state.uid };
    },
  }),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'verified-cookie' }) }),
  headers: async () => state.headers,
}));
vi.mock('@/modules/store', () => ({ getUserStore: () => state.store }));
import { proxy } from '@/proxy';
import { GET, PUT } from '@/app/api/me/favourites/route';
import { registerWorkspaceSignal, workspaceFetch } from './request';

beforeEach(() => {
  state.uid = 'bob';
  state.store = new MemoryUserStore();
  state.dispatched.mockClear();
  vi.stubGlobal('location', new URL('https://studio.test/'));
  vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    headers.set('cookie', '__session=verified-cookie');
    const req = new NextRequest(new URL(input, 'https://studio.test/'), {
      ...init,
      signal: init.signal ?? undefined,
      headers,
    });
    state.headers = headers;
    const gate = await proxy(req);
    if (gate.status !== 200) return gate;
    state.dispatched(req);
    if (req.nextUrl.pathname === '/api/me/favourites')
      return req.method === 'PUT' ? PUT(req) : GET();
    return Response.json({ ok: true });
  });
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['/api/documents', 'GET'],
  ['/api/documents/doc', 'PUT'],
  ['/api/documents/doc', 'DELETE'],
  ['/api/coach', 'POST'],
  ['/api/coach', 'DELETE'],
  ['/api/coach/paths', 'POST'],
  ['/api/makeover', 'POST'],
  ['/api/makeover/claim', 'POST'],
  ['/api/makeover/polish', 'POST'],
  ['/api/me/favourites', 'GET'],
  ['/api/me/favourites', 'PUT'],
  ['/api/portfolio', 'GET'],
  ['/api/portfolio', 'PUT'],
  ['/api/portfolio', 'DELETE'],
  ['/api/portfolio/images', 'POST'],
  ['/api/linkedin/review', 'POST'],
  ['/api/skills', 'POST'],
  ['/api/skills/plan', 'PUT'],
  ['/api/skills/plan', 'DELETE'],
  ['/api/stories', 'POST'],
  ['/api/stories/story', 'PUT'],
  ['/api/stories/story', 'DELETE'],
  ['/api/stories/draft', 'POST'],
  ['/api/shares', 'GET'],
  ['/api/shares/token', 'PATCH'],
  ['/api/card', 'POST'],
])('fences an old task from the replacement session on %s %s', async (path, method) => {
  const controller = new AbortController();
  registerWorkspaceSignal(controller.signal, 'alice');
  const response = await workspaceFetch(path, { method, signal: controller.signal });
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({
    error: { details: { reason: 'WORKSPACE_OWNER_MISMATCH' } },
  });
  expect(state.dispatched).not.toHaveBeenCalled();
});
it('allows favourite writes only into the verified captured account', async () => {
  const design = DESIGN_IDS[0]!;
  const controller = new AbortController();
  registerWorkspaceSignal(controller.signal, 'bob');
  const response = await workspaceFetch('/api/me/favourites', {
    method: 'PUT',
    signal: controller.signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [design] }),
  });
  expect(response.status).toBe(200);
  expect(await state.store.favouriteDesigns('bob')).toEqual([design]);
  state.uid = 'alice';
  const stale = await workspaceFetch('/api/me/favourites', {
    method: 'PUT',
    signal: controller.signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [] }),
  });
  expect(stale.status).toBe(403);
  expect(await state.store.favouriteDesigns('bob')).toEqual([design]);
  expect(await state.store.favouriteDesigns('alice')).toEqual([]);
});
it('never lets an owner header authenticate a missing/revoked session, including guest tools', async () => {
  state.uid = null;
  expect(
    (
      await workspaceFetch('/api/makeover', {
        method: 'POST',
        headers: { 'X-Workspace-Owner': 'alice' },
      })
    ).status,
  ).toBe(403);
  expect(state.dispatched).not.toHaveBeenCalled();
});
it('keeps guest-capable requests usable without an owner assertion', async () => {
  state.uid = null;
  expect((await workspaceFetch('/api/makeover', { method: 'POST' })).status).toBe(200);
  expect(state.dispatched).toHaveBeenCalledOnce();
});
