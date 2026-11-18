import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  cookie: 'valid' as string | undefined,
  owner: null as string | null,
  verify: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (state.cookie ? { value: state.cookie } : undefined) }),
  headers: async () =>
    new Headers(state.owner === null ? {} : { 'X-Workspace-Owner': state.owner }),
}));
vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: () => ({ verifySessionCookie: state.verify }),
}));
import { currentUser } from './session';
beforeEach(() => {
  state.cookie = 'valid';
  state.owner = null;
  state.verify.mockReset().mockResolvedValue({ uid: 'alice' });
});
it('asserts the owner against the revoked-checked session', async () => {
  state.owner = 'alice';
  expect((await currentUser())?.uid).toBe('alice');
  expect(state.verify).toHaveBeenCalledWith('valid', true);
  state.owner = 'bob';
  await expect(currentUser()).rejects.toMatchObject({ code: 'WORKSPACE_OWNER_MISMATCH' });
});
it.each(['missing', 'revoked'])(
  'does not downgrade an owner assertion to guest after %s auth',
  async (mode) => {
    state.owner = 'alice';
    if (mode === 'missing') state.cookie = undefined;
    else state.verify.mockRejectedValue(new Error('revoked'));
    await expect(currentUser()).rejects.toMatchObject({ code: 'WORKSPACE_OWNER_MISMATCH' });
  },
);
it('preserves guest behavior without an assertion', async () => {
  state.cookie = undefined;
  expect(await currentUser()).toBeNull();
});

import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
it('returns a structured 403 before guest-capable API handlers for a wrong or revoked owner', async () => {
  const request = (owner: string, cookie = 'valid') =>
    new NextRequest('http://localhost/api/pdf', {
      headers: { 'X-Workspace-Owner': owner, cookie: `__session=${cookie}` },
    });
  expect((await proxy(request('alice'))).status).toBe(200);
  const mismatch = await proxy(request('bob'));
  expect(mismatch.status).toBe(403);
  expect((await mismatch.json()).error.details.reason).toBe('WORKSPACE_OWNER_MISMATCH');
  state.verify.mockRejectedValue(new Error('revoked'));
  expect((await proxy(request('alice'))).status).toBe(403);
  expect((await proxy(request('alice', ''))).status).toBe(403);
});
it('does not authenticate a request from its owner header or change unasserted guest requests', async () => {
  const guest = new NextRequest('http://localhost/api/pdf');
  expect((await proxy(guest)).status).toBe(200);
  expect(state.verify).not.toHaveBeenCalled();
  const forged = new NextRequest('http://localhost/api/pdf', {
    headers: { 'X-Workspace-Owner': 'alice' },
  });
  expect((await proxy(forged)).status).toBe(403);
  expect(state.verify).not.toHaveBeenCalled();
});
