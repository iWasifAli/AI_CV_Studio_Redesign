import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryUserStore } from '@/modules/store/memory';
import { jobInput, type Job } from '@/modules/jobs/schema';
import { driver } from '@/modules/resume/fixtures';
import { advertFingerprint } from '@/modules/jobs/advert';
import { POST } from './route';

let user: { uid: string } | null;
let store: MemoryUserStore;
let premium: boolean;
let enabled: boolean;
let allowed: boolean;
const release = vi.fn(async () => {});
const run = vi.fn();
const reserve = vi.fn();
vi.mock('@/modules/identity/session', () => ({ currentUser: async () => user }));
vi.mock('@/modules/store', () => ({ getUserStore: () => store }));
vi.mock('@/modules/billing/server', () => ({
  planFor: async () => ({ plan: premium ? 'premium' : 'free' }),
  getBusinessConfig: async () => ({ value: { features: { ai: enabled, atsCheck: enabled } } }),
  reserve: (...args: unknown[]) => reserve(...args),
  denialCode: () => 'LIMIT_REACHED',
}));
vi.mock('@/modules/ai/config', () => ({
  getAiProvider: () => ({ provider: {} }),
  aiModels: () => ({}),
}));
vi.mock('@/modules/ai/limits', () => ({ sharedAiLimiter: () => () => ({ ok: allowed }) }));
vi.mock('@/modules/metrics/server', () => ({
  aiBudgetSpent: async () => false,
  track: async () => {},
}));
vi.mock('@/modules/ai/run', () => ({ runTask: (...args: unknown[]) => run(...args) }));
const advert =
  'We need delivery support with Cold chain and Forklift skills. Plan routes carefully and deliver reliable customer service every day.';
const job: Job = {
  ...jobInput.parse({ title: 'Driver', advert }),
  id: 'job',
  createdAt: '2026-11-19T00:00:00Z',
  updatedAt: '2026-11-19T00:00:00Z',
};
const request = (body: unknown) =>
  new Request('http://localhost/api/quality/keywords/rewrite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
async function body() {
  return {
    document: driver,
    jobId: 'job',
    advertFingerprint: await advertFingerprint(advert),
    keywords: ['Cold chain', 'Forklift'],
  };
}

describe('keyword rewrite API', () => {
  beforeEach(async () => {
    store = new MemoryUserStore();
    user = { uid: 'u' };
    premium = enabled = allowed = true;
    await store.putJob('u', job);
    vi.clearAllMocks();
    reserve.mockResolvedValue({ decision: { ok: true }, release });
    run.mockResolvedValue({
      ok: true,
      result: {
        changes: [
          {
            target: 'basics.summary',
            after: `${driver.basics.summary} Skills include Cold chain and Forklift.`,
            keywords: ['Cold chain', 'Forklift'],
          },
        ],
        skipped: [],
      },
    });
  });
  it('charges one action for a validated batch and never persists the CV server-side', async () => {
    const response = await POST(request(await body()));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      included: ['Cold chain', 'Forklift'],
      patches: [{ target: 'basics.summary', before: driver.basics.summary }],
    });
    expect(reserve).toHaveBeenCalledExactlyOnceWith(user, 'ai.action');
    expect(release).not.toHaveBeenCalled();
    expect(await store.getDoc('u', driver.id)).toBeNull();
  });
  it('rejects unauthenticated, free and non-owner requests before charging', async () => {
    user = null;
    expect((await POST(request(await body()))).status).toBe(401);
    user = { uid: 'u' };
    premium = false;
    expect((await POST(request(await body()))).status).toBe(402);
    premium = true;
    user = { uid: 'other' };
    expect((await POST(request(await body()))).status).toBe(404);
    expect(reserve).not.toHaveBeenCalled();
  });
  it('rejects disabled features, stale adverts and non-advert keywords before charging', async () => {
    enabled = false;
    expect((await POST(request(await body()))).status).toBe(403);
    enabled = true;
    expect(
      (await POST(request({ ...(await body()), advertFingerprint: 'a'.repeat(64) }))).status,
    ).toBe(409);
    expect((await POST(request({ ...(await body()), keywords: ['Invented skill'] }))).status).toBe(
      400,
    );
    expect((await POST(request({ ...(await body()), keywords: [] }))).status).toBe(400);
    expect(reserve).not.toHaveBeenCalled();
  });
  it('refunds errors, disabled tasks and entirely unusable output', async () => {
    for (const result of [
      { ok: false, code: 'AI_UNAVAILABLE' },
      { ok: false, reason: 'disabled' },
      { ok: true, result: { changes: [], skipped: [] } },
    ]) {
      run.mockResolvedValueOnce(result);
      await POST(request(await body()));
    }
    expect(release).toHaveBeenCalledTimes(3);
  });
  it('does not charge a selection already present in the CV', async () => {
    const input = await body();
    input.document = {
      ...driver,
      basics: { ...driver.basics, summary: 'Skills include Cold chain and Forklift.' },
    };
    const response = await POST(request(input));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ patches: [], included: [] });
    expect(reserve).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it('refunds a response if the advert changed while AI was running', async () => {
    const result = await run();
    run.mockImplementationOnce(async () => {
      await store.putJob('u', { ...job, advert: `${advert} New requirement.` });
      return result;
    });
    expect((await POST(request(await body()))).status).toBe(409);
    expect(release).toHaveBeenCalledOnce();
  });
  it('enforces rate and allowance gates without calling the model', async () => {
    allowed = false;
    expect((await POST(request(await body()))).status).toBe(429);
    expect(run).not.toHaveBeenCalled();
    allowed = true;
    reserve.mockResolvedValueOnce({ decision: { ok: false, message: 'Limit reached' }, release });
    expect((await POST(request(await body()))).status).toBe(402);
    expect(run).not.toHaveBeenCalled();
  });
});
