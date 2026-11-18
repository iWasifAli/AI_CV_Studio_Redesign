import { afterEach, expect, it, vi } from 'vitest';
import { storiesApi } from './api';
import { registerWorkspaceSignal } from '@/features/workspace/request';
import { driver } from '@/modules/resume/fixtures';
import type { StoryInput } from '@/modules/stories/schema';
afterEach(() => vi.unstubAllGlobals());

it('carries the captured signal and owner through every story operation', async () => {
  const controller = new AbortController();
  registerWorkspaceSignal(controller.signal, 'alice');
  const fetch = vi.fn(async () =>
    Response.json({ stories: [], story: { id: 'story' }, draft: {}, ok: true }),
  );
  vi.stubGlobal('fetch', fetch);
  const options = { signal: controller.signal, ownerUid: 'bob' };
  const input = { title: 'Example' } as StoryInput;
  await storiesApi.list(options);
  await storiesApi.create(input, options);
  await storiesApi.update('story', input, options);
  await storiesApi.remove('story', options);
  await storiesApi.draft(driver, 'point', 'notes', options);
  expect(fetch.mock.calls).toHaveLength(5);
  for (const [, init] of fetch.mock.calls as unknown as [string, RequestInit][]) {
    expect(init.signal).toBe(controller.signal);
    expect(new Headers(init.headers).get('X-Workspace-Owner')).toBe('alice');
    if (init.body) expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  }
});
it('accepts an explicit captured owner outside a workspace and keeps old call signatures', async () => {
  const fetch = vi.fn(async () => Response.json({ stories: [] }));
  vi.stubGlobal('fetch', fetch);
  await storiesApi.list({ ownerUid: 'alice' });
  await storiesApi.list();
  const calls = fetch.mock.calls as unknown as [string, RequestInit][];
  expect(new Headers(calls[0]![1].headers).get('X-Workspace-Owner')).toBe('alice');
  expect(new Headers(calls[1]![1].headers).has('X-Workspace-Owner')).toBe(false);
});
it('does not return a response body completed after cancellation', async () => {
  const controller = new AbortController();
  vi.stubGlobal('fetch', async () => ({
    ok: true,
    json: async () => {
      controller.abort();
      return { stories: [] };
    },
  }));
  await expect(storiesApi.list({ signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  });
});
