import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryUserStore } from '@/modules/store/memory';
import { jobInput, type Job } from '@/modules/jobs/schema';
import { POST } from './route';

let user: { uid: string } | null;
let store: MemoryUserStore;
vi.mock('@/modules/identity/session', () => ({ currentUser: async () => user }));
vi.mock('@/modules/store', () => ({ getUserStore: () => store }));

const original: Job = {
  ...jobInput.parse({ title: 'Driver' }),
  id: 'a',
  createdAt: '2026-11-18T10:00:00.000Z',
  updatedAt: '2026-11-18T10:00:00.000Z',
};
const input = {
  jobId: 'a',
  fromStage: 'saved',
  toStage: 'applied',
  beforeId: null,
  revision: 0,
  expectedJobUpdatedAt: original.updatedAt,
};
const request = (body: unknown) =>
  new Request('http://localhost/api/jobs/board/move', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('board move API', () => {
  beforeEach(async () => {
    store = new MemoryUserStore();
    user = { uid: 'u' };
    await store.putJob('u', original);
  });
  it('uses normal stage history and returns the committed canonical state', async () => {
    const response = await POST(request(input));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.job).toMatchObject({ stage: 'applied', createdAt: original.createdAt });
    expect(result.job.appliedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.job.reached.applied).toBe(result.job.appliedOn);
    expect(result.board).toMatchObject({ revision: 1, columns: { applied: ['a'], saved: [] } });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('does not modify application content on an order-only no-op', async () => {
    const response = await POST(request({ ...input, toStage: 'saved' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ job: original, board: { revision: 0 } });
    expect(await store.getJob('u', 'a')).toEqual(original);
  });
  it('rejects visitors, another account’s job, and invalid payloads', async () => {
    user = null;
    expect((await POST(request(input))).status).toBe(401);
    user = { uid: 'other' };
    expect((await POST(request(input))).status).toBe(404);
    user = { uid: 'u' };
    for (const patch of [
      { toStage: 'unknown' },
      { revision: -1 },
      { jobId: '../a' },
      { extra: 'field' },
    ])
      expect((await POST(request({ ...input, ...patch }))).status).toBe(400);
  });
  it('rejects stale revisions and invalid anchors without any partial write', async () => {
    for (const patch of [{ revision: 2 }, { fromStage: 'offer' }, { beforeId: 'missing' }])
      expect((await POST(request({ ...input, ...patch }))).status).toBe(409);
    expect((await store.getJobBoard('u')).board.revision).toBe(0);
    expect(await store.getJob('u', 'a')).toEqual(original);
  });
});
