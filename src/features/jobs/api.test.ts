import { afterEach, describe, expect, it, vi } from 'vitest';
import { jobsApi, jobAiApi, JobsError } from './api';
import type { ResumeDocument } from '@/modules/resume/schema';

afterEach(() => vi.unstubAllGlobals());
const respond = (body: unknown, status = 200) => {
  const fetcher = vi.fn(async (...args: [string, RequestInit?]) => {
    void args;
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
};
describe('workspace job requests', () => {
  it('sends the persisted create intent and originating owner', async () => {
    const fetcher = respond({ job: { id: 'j', revision: 0 } });
    await jobsApi.create({ title: 'Engineer' }, { ownerUid: 'alice', idempotencyKey: 'uuid' });
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('X-Workspace-Owner')).toBe('alice');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('uuid');
  });
  it('sends expected revisions on manual and AI writes', async () => {
    const fetcher = respond({ job: { id: 'j', revision: 5 } });
    const options = { ownerUid: 'alice', expectedRevision: 4 };
    await jobsApi.update('j', { notes: 'draft' }, options);
    await jobAiApi.brief('j', {} as ResumeDocument, 'research', options);
    for (const call of fetcher.mock.calls) {
      expect(JSON.parse((call[1] as RequestInit).body as string).expectedRevision).toBe(4);
    }
  });
  it('preserves flexible conflict records and generated suggestions', async () => {
    const details = {
      current: { id: 'j', revision: 9 },
      generated: { brief: { company: 'Acme' } },
      reason: 'revision',
    };
    respond({ error: { message: 'Changed elsewhere', details } }, 409);
    await expect(jobAiApi.brief('j', {} as ResumeDocument, '')).rejects.toMatchObject({
      status: 409,
      details,
      reason: 'revision',
    });
  });
  it('rejects completed responses after account invalidation', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', async () => {
      controller.abort();
      return new Response(JSON.stringify({ job: { id: 'j' } }));
    });
    await expect(
      jobsApi.create({ title: 'Engineer' }, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('keeps the legacy error constructor compatible', () => {
    expect(new JobsError('No', 402, 'quota').reason).toBe('quota');
  });
});
