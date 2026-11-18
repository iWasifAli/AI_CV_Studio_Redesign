import { afterEach, expect, it, vi } from 'vitest';
import { lettersApi } from './api';
import type { ResumeDocument } from '@/modules/resume/schema';
afterEach(() => vi.unstubAllGlobals());
it('sends create intent, owner and sequential letter revisions', async () => {
  const calls: RequestInit[] = [];
  vi.stubGlobal('fetch', async (_: string, init: RequestInit) => {
    calls.push(init);
    return new Response(JSON.stringify({ letter: { id: 'l', revision: calls.length } }));
  });
  await lettersApi.create({ type: 'cover' }, { ownerUid: 'alice', idempotencyKey: 'uuid' });
  await lettersApi.update('l', { subject: 'Edited' }, { ownerUid: 'alice', expectedRevision: 1 });
  await lettersApi.draft('l', {} as ResumeDocument, 'warm', {
    ownerUid: 'alice',
    expectedRevision: 2,
  });
  expect(new Headers(calls[0]!.headers).get('Idempotency-Key')).toBe('uuid');
  expect(calls.map((c) => new Headers(c.headers).get('X-Workspace-Owner'))).toEqual([
    'alice',
    'alice',
    'alice',
  ]);
  expect(calls.slice(1).map((c) => JSON.parse(c.body as string).expectedRevision)).toEqual([1, 2]);
});
it('retains generated text on a conditional failure', async () => {
  const details = { current: { id: 'l', revision: 3 }, generated: { paragraphs: ['Suggestion'] } };
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(JSON.stringify({ error: { message: 'Conflict', details } }), { status: 409 }),
  );
  await expect(lettersApi.draft('l', {} as ResumeDocument, 'warm')).rejects.toMatchObject({
    status: 409,
    details,
  });
});
