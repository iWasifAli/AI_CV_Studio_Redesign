import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryUserStore } from '@/modules/store/memory';
import { jobInput, type Job } from '@/modules/jobs/schema';
import { driver } from '@/modules/resume/fixtures';
import { advertFingerprint } from '@/modules/jobs/advert';
import { POST } from './route';
let store: MemoryUserStore;
const done = vi.fn();
const run = vi.fn();
const advert =
  'Delivery support needed for customer service and planning routes. Forklift skills required and Cold chain experience preferred.';
const job: Job = {
  ...jobInput.parse({ title: 'Driver', advert }),
  id: 'job',
  createdAt: '',
  updatedAt: '',
};
vi.mock('@/modules/store', () => ({ getUserStore: () => store }));
vi.mock('@/modules/jobs/ai-route', () => ({
  prepareJobAi: async () => ({ user: { uid: 'u' }, doc: driver, job, rid: 'r', deps: {}, done }),
}));
vi.mock('@/modules/ai/run', () => ({ runTask: (...args: unknown[]) => run(...args) }));
vi.mock('@/modules/metrics/activity', () => ({ noteUse: async () => {} }));
const request = () =>
  POST(new Request('http://localhost/api/jobs/job/match', { method: 'POST' }), {
    params: Promise.resolve({ id: 'job' }),
  });
describe('match report provenance', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    store = new MemoryUserStore();
    await store.putJob('u', job);
    run.mockResolvedValue({
      ok: true,
      result: { summary: 'Match', requirements: [], keywords: ['Forklift'] },
    });
  });
  it('records the actual source CV and exact advert revision', async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.json()).job.match).toMatchObject({
      sourceDocumentId: driver.id,
      sourceTitle: driver.title,
      advertFingerprint: await advertFingerprint(advert),
    });
    expect(done).toHaveBeenCalledExactlyOnceWith(true);
  });
  it('rejects and refunds an in-flight result when the advert changes', async () => {
    const result = await run();
    run.mockImplementationOnce(async () => {
      await store.putJob('u', { ...job, advert: `${advert} Updated.` });
      return result;
    });
    expect((await request()).status).toBe(409);
    expect(done).toHaveBeenCalledExactlyOnceWith(false);
    expect((await store.getJob('u', job.id))?.match).toBeUndefined();
  });
});
