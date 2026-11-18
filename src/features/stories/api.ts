'use client';

import { workspaceFetch } from '@/features/workspace/request';

import { JobsError } from '@/features/jobs/api';
import type { ResumeDocument } from '@/modules/resume/schema';
import type { Story, StoryInput } from '@/modules/stories/schema';

type StoryRequestOptions = { signal?: AbortSignal; ownerUid?: string | null };

/** Browser helpers for the story bank. Errors carry the server's plain-language message. */
async function call<T>(
  path: string,
  init?: RequestInit,
  options?: StoryRequestOptions,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('content-type', 'application/json');
  if (options?.ownerUid) headers.set('X-Workspace-Owner', options.ownerUid);
  const r = await workspaceFetch(path, {
    cache: 'no-store',
    ...init,
    headers,
    signal: options?.signal ?? init?.signal,
  });
  const j = (await r.json().catch(() => null)) as
    (T & { error?: undefined }) | { error: { message: string; reason?: string } } | null;
  options?.signal?.throwIfAborted();
  if (!r.ok || !j || ('error' in j && j.error))
    throw new JobsError(
      (j && 'error' in j && j.error?.message) || 'That didn’t work. Please try again.',
      r.status,
      (j && 'error' in j && j.error?.reason) || undefined,
    );
  return j as T;
}

export type StoryDraft = Required<
  Pick<StoryInput, 'title' | 'situation' | 'task' | 'action' | 'result' | 'skills' | 'source'>
>;

export const storiesApi = {
  list: (options?: StoryRequestOptions) =>
    call<{ stories: Story[]; max: number; enabled: boolean }>('/api/stories', undefined, options),
  create: (input: StoryInput, options?: StoryRequestOptions) =>
    call<{ story: Story }>(
      '/api/stories',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      options,
    ).then((r) => r.story),
  update: (id: string, patch: Partial<StoryInput>, options?: StoryRequestOptions) =>
    call<{ story: Story }>(
      `/api/stories/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(patch),
      },
      options,
    ).then((r) => r.story),
  remove: (id: string, options?: StoryRequestOptions) =>
    call<{ ok: true }>(`/api/stories/${id}`, { method: 'DELETE' }, options),
  draft: (document: ResumeDocument, point: string, notes: string, options?: StoryRequestOptions) =>
    call<{ draft: StoryDraft }>(
      '/api/stories/draft',
      {
        method: 'POST',
        body: JSON.stringify({ document, point, notes }),
      },
      options,
    ).then((r) => r.draft),
};
