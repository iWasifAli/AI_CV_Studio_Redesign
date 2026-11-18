import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MemoryUserStore } from '@/modules/store/memory';
import { driver } from '@/modules/resume/fixtures';
const state = vi.hoisted(() => ({
  owner: 'alice',
  uid: 'bob',
  store: null as unknown as MemoryUserStore,
  noteUse: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'new-owner-cookie' }) }),
  headers: async () => new Headers({ 'X-Workspace-Owner': state.owner }),
}));
vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: () => ({ verifySessionCookie: async () => ({ uid: state.uid }) }),
}));
vi.mock('@/modules/store', () => ({ getUserStore: () => state.store, MAX_DOCS_PER_USER: 50 }));
vi.mock('@/modules/metrics/activity', () => ({ noteUse: state.noteUse }));
import { GET as list } from '@/app/api/documents/route';
import { GET, PUT, DELETE } from '@/app/api/documents/[id]/route';
import { proxy } from '@/proxy';
beforeEach(async () => {
  state.owner = 'alice';
  state.uid = 'bob';
  state.store = new MemoryUserStore();
  vi.clearAllMocks();
  await state.store.putDoc('bob', { ...driver, title: 'Bob canonical' }, 50);
});
it.each([
  ['list', list, 'GET'],
  ['get', GET, 'GET'],
  ['put', PUT, 'PUT'],
  ['delete', DELETE, 'DELETE'],
] as const)(
  'rejects a queued old-owner document %s after the verified session switches',
  async (name, handler, method) => {
    const request = new NextRequest(
      `http://localhost/api/documents${name === 'list' ? '' : `/${driver.id}`}`,
      {
        method,
        headers: { 'X-Workspace-Owner': 'alice', cookie: '__session=new-owner-cookie' },
        ...(method === 'PUT'
          ? { body: JSON.stringify({ document: { ...driver, title: 'Alice queued draft' } }) }
          : {}),
      },
    );
    expect((await proxy(request)).status).toBe(403);
    // The shared session assertion independently fences route dispatch as well.
    const response = await handler(request, { params: Promise.resolve({ id: driver.id }) });
    expect(response.status).toBe(403);
    expect((await response.json()).error.details.reason).toBe('WORKSPACE_OWNER_MISMATCH');
    expect((await state.store.getDoc('bob', driver.id))?.doc?.title).toBe('Bob canonical');
    expect(await state.store.listDocs('alice')).toEqual([]);
    expect(state.noteUse).not.toHaveBeenCalled();
  },
);
it('accepts document sync for the verified owner', async () => {
  state.owner = 'bob';
  const req = new Request(`http://localhost/api/documents/${driver.id}`);
  const response = await GET(req, { params: Promise.resolve({ id: driver.id }) });
  expect(response.status).toBe(200);
  expect((await response.json()).doc.title).toBe('Bob canonical');
});
