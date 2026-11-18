import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryUserStore } from '@/modules/store/memory';
import { driver } from '@/modules/resume/fixtures';
import { jobInput } from './schema';
const deps = vi.hoisted(() => ({ store: null as unknown as MemoryUserStore, run: vi.fn() }));
vi.mock('@/modules/store', () => ({ getUserStore: () => deps.store }));
vi.mock('@/modules/identity/session', async (original) => ({
  ...(await original<typeof import('@/modules/identity/session')>()),
  currentUser: async () => ({ uid: 'u', email: null }),
}));
vi.mock('@/modules/metrics/activity', () => ({ noteUse: async () => {} }));
vi.mock('@/modules/metrics/server', () => ({
  track: async () => {},
  aiBudgetSpent: async () => false,
}));
vi.mock('@/modules/ai/config', () => ({
  getAiProvider: () => ({ provider: {} }),
  aiModels: () => ({}),
}));
vi.mock('@/modules/ai/limits', () => ({ sharedAiLimiter: () => () => ({ ok: true }) }));
vi.mock('@/modules/ai/run', () => ({ runTask: deps.run }));
vi.mock('@/modules/billing/server', () => ({
  reserve: async () => {
    await deps.store.reserveUsage('u', 'month', 'ai.action', 20);
    return {
      decision: { ok: true },
      release: () => deps.store.releaseUsage('u', 'month', 'ai.action'),
    };
  },
}));
import { POST as match } from '@/app/api/jobs/[id]/match/route';
import { saveGeneratedJobUpdate } from './updates';
beforeEach(async () => {
  vi.restoreAllMocks();
  deps.store = new MemoryUserStore();
  await deps.store.putJob('u', {
    ...jobInput.parse({ title: 'Driver', advert: 'A useful job advert. '.repeat(10) }),
    id: 'j',
    createdAt: 'now',
    updatedAt: 'now',
  });
  deps.run.mockResolvedValue({
    ok: true,
    result: { summary: 'Suggestion', requirements: [], keywords: [] },
    findings: [],
  });
});
it('refunds an AI action when the route cannot persist the generated job result', async () => {
  const failure = new Error('Persistence unavailable before commit');
  vi.spyOn(deps.store, 'updateJob').mockRejectedValue(failure);
  await expect(
    match(
      new Request('http://localhost/api/jobs/j/match', {
        method: 'POST',
        body: JSON.stringify({ document: driver, expectedRevision: 1 }),
      }),
      { params: Promise.resolve({ id: 'j' }) },
    ),
  ).rejects.toBe(failure);
  expect((await deps.store.getUsage('u', 'month'))['ai.action']).toBe(0);
  expect((await deps.store.getJob('u', 'j'))?.revision).toBe(1);
  expect((await deps.store.getJob('u', 'j'))?.match).toBeUndefined();
});
it.each(['suggestion', 'transaction'] as const)(
  'refunds if building the %s throws and preserves the original failure',
  async (phase) => {
    const failure = new Error('Edit failed');
    await deps.store.reserveUsage('u', 'month', 'ai.action', 20);
    let calls = 0;
    const job = (await deps.store.getJob('u', 'j'))!;
    await expect(
      saveGeneratedJobUpdate(
        {
          user: { uid: 'u' },
          job,
          body: {},
          rid: 'r',
          done: async () => {},
          release: () => deps.store.releaseUsage('u', 'month', 'ai.action'),
        },
        (current) => {
          if (++calls === (phase === 'suggestion' ? 1 : 2)) throw failure;
          return current;
        },
      ),
    ).rejects.toBe(failure);
    expect((await deps.store.getUsage('u', 'month'))['ai.action']).toBe(0);
    expect((await deps.store.getJob('u', 'j'))?.revision).toBe(1);
  },
);
it('does not replace the persistence error if reservation cleanup also fails', async () => {
  const failure = new Error('Persistence failed');
  vi.spyOn(deps.store, 'updateJob').mockRejectedValue(failure);
  const release = vi.fn().mockRejectedValue(new Error('Refund failed'));
  await expect(
    saveGeneratedJobUpdate(
      {
        user: { uid: 'u' },
        job: (await deps.store.getJob('u', 'j'))!,
        body: {},
        rid: 'r',
        release,
        done: async () => {},
      },
      (current) => current,
    ),
  ).rejects.toBe(failure);
  expect(release).toHaveBeenCalledOnce();
});
