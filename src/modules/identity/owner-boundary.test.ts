import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MemoryUserStore } from '@/modules/store/memory';
const state = vi.hoisted(() => ({ verify: vi.fn(), store: null as unknown as MemoryUserStore }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'valid' }) }),
  headers: async () => new Headers({ 'X-Workspace-Owner': 'alice' }),
}));
vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: () => ({ verifySessionCookie: state.verify }),
}));
vi.mock('@/modules/store', () => ({ getUserStore: () => state.store }));
import { proxy } from '@/proxy';
import { GET as documents } from '@/app/api/documents/route';
import { GET as coach } from '@/app/api/coach/route';
import { GET as letters } from '@/app/api/letters/route';
import { GET as jobs } from '@/app/api/jobs/route';
import { GET as entitlements } from '@/app/api/me/entitlements/route';
import { currentUser, AuthError } from './session';
import { POST as pdf } from '@/app/api/pdf/route';
import { driver } from '@/modules/resume/fixtures';
beforeEach(() => {
  vi.restoreAllMocks();
  state.verify.mockReset();
  state.store = new MemoryUserStore();
});
it.each([
  ['documents', documents],
  ['coach', coach],
  ['letters', letters],
  ['jobs', jobs],
  ['me/entitlements', entitlements],
] as const)(
  '%s returns structured 403 when verification is revoked between proxy and handler',
  async (path, handler) => {
    state.verify
      .mockResolvedValueOnce({ uid: 'alice' })
      .mockRejectedValueOnce(new Error('revoked'));
    expect(
      (
        await proxy(
          new NextRequest(`http://localhost/api/${path}`, {
            headers: { 'X-Workspace-Owner': 'alice', cookie: '__session=valid' },
          }),
        )
      ).status,
    ).toBe(200);
    const response = await handler();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'FORBIDDEN', details: { reason: 'WORKSPACE_OWNER_MISMATCH' } },
    });
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(state.verify).toHaveBeenCalledTimes(2);
    expect(state.verify).toHaveBeenLastCalledWith('valid', true);
  },
);
it('keeps currentUser fail-closed for a mismatched assertion', async () => {
  state.verify.mockResolvedValue({ uid: 'bob' });
  await expect(currentUser()).rejects.toMatchObject({ code: 'WORKSPACE_OWNER_MISMATCH' });
});
it.each([
  new Error('Store offline'),
  new AuthError('NO_SESSION', 'Unrelated auth error'),
  Object.assign(new Error('Lookalike'), { code: 'WORKSPACE_OWNER_MISMATCH' }),
])('preserves unrelated route errors: %s', async (failure) => {
  state.verify.mockResolvedValue({ uid: 'alice' });
  vi.spyOn(state.store, 'listDocs').mockRejectedValue(failure);
  await expect(documents()).rejects.toBe(failure);
});

it('rejects a revoked owner on a guest-capable PDF request without reserving guest or account usage', async () => {
  state.verify.mockResolvedValueOnce({ uid: 'alice' }).mockRejectedValueOnce(new Error('revoked'));
  const request = new NextRequest('http://localhost/api/pdf', {
    method: 'POST',
    headers: { 'X-Workspace-Owner': 'alice', cookie: '__session=valid' },
    body: JSON.stringify({ document: driver }),
  });
  expect((await proxy(request)).status).toBe(200);
  const response = await pdf(request);
  expect(response.status).toBe(403);
  expect((await response.json()).error.details.reason).toBe('WORKSPACE_OWNER_MISMATCH');
  expect(await state.store.getUsage('alice', new Date().toISOString().slice(0, 7))).toEqual({});
});
