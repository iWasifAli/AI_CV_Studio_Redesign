import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerWorkspaceSignal, workspaceFetch } from './request';

const nativeFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal('location', new URL('https://studio.test/workspace'));
  vi.stubGlobal('fetch', nativeFetch);
  nativeFetch.mockReset().mockResolvedValue(new Response('{}'));
});
afterEach(() => vi.unstubAllGlobals());

it('uses the original signal owner and preserves request headers/body', async () => {
  const controller = new AbortController();
  registerWorkspaceSignal(controller.signal, 'alice');
  await workspaceFetch('/api/stories', {
    method: 'POST',
    signal: controller.signal,
    body: '{"title":"draft"}',
    headers: { 'content-type': 'application/json', 'X-Workspace-Owner': 'bob' },
  });
  const init = nativeFetch.mock.calls[0]![1] as RequestInit;
  expect(new Headers(init.headers).get('X-Workspace-Owner')).toBe('alice');
  expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  expect(init).toMatchObject({
    signal: controller.signal,
    body: '{"title":"draft"}',
    redirect: 'error',
  });
  expect(() => registerWorkspaceSignal(controller.signal, 'bob')).toThrow();
});
it('preserves explicit owner without a registered signal and leaves legacy calls usable', async () => {
  await workspaceFetch('/api/portfolio', { headers: [['X-Workspace-Owner', 'alice']] });
  expect(new Headers(nativeFetch.mock.calls[0]![1].headers).get('X-Workspace-Owner')).toBe('alice');
  await workspaceFetch('/api/designs/popularity');
  expect(new Headers(nativeFetch.mock.calls[1]![1].headers).has('X-Workspace-Owner')).toBe(false);
});
it.each([
  'https://other.test/api',
  '//other.test/api',
  'https://studio.test.evil/api',
  'http://studio.test/api',
  'https://studio.test:444/api',
])('never sends owner to %s', async (url) => {
  const controller = new AbortController();
  registerWorkspaceSignal(controller.signal, 'alice');
  await workspaceFetch(url, {
    signal: controller.signal,
    headers: { 'X-Workspace-Owner': 'bob', accept: 'application/json' },
  });
  const headers = new Headers(nativeFetch.mock.calls[0]![1].headers);
  expect(headers.has('X-Workspace-Owner')).toBe(false);
  expect(headers.get('accept')).toBe('application/json');
});
it('handles Request input headers and its abort signal', async () => {
  const controller = new AbortController();
  const request = new Request('https://studio.test/api/coach', {
    signal: controller.signal,
    headers: { 'X-Workspace-Owner': 'alice' },
  });
  await workspaceFetch(request);
  expect(new Headers(nativeFetch.mock.calls[0]![1].headers).get('X-Workspace-Owner')).toBe('alice');
  controller.abort();
  await expect(workspaceFetch(request)).rejects.toMatchObject({ name: 'AbortError' });
  expect(nativeFetch).toHaveBeenCalledTimes(1);
});
it('strips owner inherited from an external Request', async () => {
  await workspaceFetch(
    new Request('https://other.test/', { headers: { 'X-Workspace-Owner': 'alice' } }),
  );
  expect(new Headers(nativeFetch.mock.calls[0]![1].headers).has('X-Workspace-Owner')).toBe(false);
});
it('rejects before dispatch and after a fetch that ignores cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(workspaceFetch('/api/coach', { signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(nativeFetch).not.toHaveBeenCalled();
  const active = new AbortController();
  nativeFetch.mockImplementation(async () => {
    active.abort();
    return new Response('{}');
  });
  await expect(workspaceFetch('/api/coach', { signal: active.signal })).rejects.toMatchObject({
    name: 'AbortError',
  });
});
