import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryUserStore } from './memory';
import { driver } from '@/modules/resume/fixtures';
import { jobInput } from '@/modules/jobs/schema';
import { savedLetterInput } from '@/modules/letters/schema';
const deps = vi.hoisted(() => ({ store: null as unknown as MemoryUserStore, run: vi.fn() }));
vi.mock('@/modules/store', () => ({ getUserStore: () => deps.store }));
vi.mock('@/modules/identity/session', () => ({
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
vi.mock('@/modules/stories/server', () => ({ storiesForAi: async () => [] }));
vi.mock('@/modules/billing/server', () => ({
  getBusinessConfig: async () => ({
    value: {
      features: { letters: true, coach: true },
      content: { hiddenLetterTypes: [] },
      plans: { premium: { maxJobs: 1 } },
      aiWeights: { coachTurn: 1 },
    },
  }),
  planFor: async () => ({ plan: 'premium' }),
  reserve: async () => {
    await deps.store.reserveUsage('u', 'month', 'ai.action', 20);
    return {
      decision: { ok: true },
      release: () => deps.store.releaseUsage('u', 'month', 'ai.action'),
    };
  },
}));
import { POST as createJob } from '@/app/api/jobs/route';
import { POST as createLetter } from '@/app/api/letters/route';
import { PUT as editJob } from '@/app/api/jobs/[id]/route';
import { PUT as editLetter } from '@/app/api/letters/[id]/route';
import { POST as draftLetter } from '@/app/api/letters/[id]/draft/route';
import { GET as getCoach, DELETE as clearCoach, POST as coach } from '@/app/api/coach/route';
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost', { method: 'POST', headers, body: JSON.stringify(body) });
const ctx = () => ({ params: Promise.resolve({ id: 'a' }) });
beforeEach(() => {
  deps.store = new MemoryUserStore();
  vi.clearAllMocks();
});
it.each([
  ['jobs', createJob, { title: 'Driver' }],
  ['letters', createLetter, { type: 'cover' }],
] as const)(
  '%s HTTP create replays the current entity and rejects changed/deleted outcomes',
  async (kind, create, input) => {
    const headers = { 'Idempotency-Key': crypto.randomUUID() };
    const results = await Promise.all([create(req(input, headers)), create(req(input, headers))]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const data = await Promise.all(results.map((r) => r.json()));
    expect(data[0]).toEqual(data[1]);
    const entity = kind === 'jobs' ? data[0].job : data[0].letter;
    expect(entity.revision).toBe(1);
    expect((await create(req({ ...input, title: 'Changed' }, headers))).status).toBe(409);
    if (kind === 'jobs') await deps.store.deleteJob('u', entity.id);
    else await deps.store.deleteLetter('u', entity.id);
    expect((await create(req(input, headers))).status).toBe(409);
    expect((await create(req(input, { 'Idempotency-Key': '../bad' }))).status).toBe(400);
  },
);
it('canonicalizes nested creation payload keys and preserves legacy no-key creation', async () => {
  const headers = { 'Idempotency-Key': crypto.randomUUID() };
  const one = await createLetter(
    req({ type: 'cover', answers: { role: 'Driver', why: 'Work' } }, headers),
  );
  const two = await createLetter(
    req({ answers: { why: 'Work', role: 'Driver' }, type: 'cover' }, headers),
  );
  expect(await one.json()).toEqual(await two.json());
  const legacy = await createLetter(req({ type: 'cover' }));
  expect(legacy.status).toBe(200);
  expect(await deps.store.listLetters('u')).toHaveLength(2);
});
it.each(['job', 'letter'])(
  '%s manual writes reject stale/invalid revisions and accept old callers',
  async (kind) => {
    const input =
      kind === 'job'
        ? jobInput.parse({ title: 'Driver' })
        : savedLetterInput.parse({ type: 'cover' });
    if (kind === 'job')
      await deps.store.putJob('u', {
        ...jobInput.parse(input),
        id: 'a',
        createdAt: 'now',
        updatedAt: 'now',
      });
    else
      await deps.store.putLetter('u', {
        ...savedLetterInput.parse(input),
        id: 'a',
        createdAt: 'now',
        updatedAt: 'now',
      });
    const handler = kind === 'job' ? editJob : editLetter;
    const edit = async (...args: Parameters<typeof handler>) => {
      const response = await handler(...args);
      if (!response) throw new Error('The handler did not return a response.');
      return response;
    };
    expect((await edit(req({ expectedRevision: 0, title: 'Stale' }), ctx())).status).toBe(409);
    expect((await edit(req({ expectedRevision: -1 }), ctx())).status).toBe(400);
    const result = await edit(req({ expectedRevision: 1, revision: 999, title: 'New' }), ctx());
    expect(result.status).toBe(200);
    expect((await result.json())[kind]).toMatchObject({ title: 'New', revision: 2 });
    expect((await edit(req({ title: 'Old client' }), ctx())).status).toBe(200);
  },
);
it.each(['edit', 'delete'])(
  'letter AI retains generated output and releases actual usage after a concurrent %s',
  async (action) => {
    await deps.store.putLetter('u', {
      ...savedLetterInput.parse({ type: 'cover', answers: { role: 'Driver' } }),
      id: 'a',
      createdAt: 'now',
      updatedAt: 'now',
    });
    deps.run.mockImplementation(async () => {
      if (action === 'edit')
        await deps.store.updateLetter('u', 'a', (l) => ({ ...l, title: 'Newer' }));
      else await deps.store.deleteLetter('u', 'a');
      return {
        ok: true,
        result: {
          greeting: 'Hello',
          paragraphs: ['Generated'],
          closing: 'Thanks',
          subject: 'Role',
        },
        findings: [],
      };
    });
    const result = await draftLetter(req({ document: driver, expectedRevision: 1 }), ctx());
    expect(result.status).toBe(409);
    const details = (await result.json()).error.details;
    expect(details.generated.paragraphs).toEqual(['Generated']);
    if (action === 'edit') expect(details.current.title).toBe('Newer');
    else expect(details.current).toBeNull();
    expect((await deps.store.getUsage('u', 'month'))['ai.action']).toBe(0);
    expect(deps.run).toHaveBeenCalledOnce();
  },
);
it('Coach clear retains its revision, fences in-flight output, and refunds usage', async () => {
  expect(await (await getCoach()).json()).toEqual({ thread: null, revision: 0 });
  deps.run.mockImplementation(async () => {
    expect((await clearCoach(req({ expectedRevision: 0 }))).status).toBe(200);
    return { ok: true, result: { reply: 'Generated reply', actions: [] } };
  });
  const result = await coach(req({ document: driver, message: 'Help', expectedRevision: 0 }));
  expect(result.status).toBe(409);
  const details = (await result.json()).error.details;
  expect(details.current).toEqual({ thread: null, revision: 1 });
  expect(details.generated.messages.at(-1).text).toBe('Generated reply');
  expect((await deps.store.getUsage('u', 'month'))['ai.action']).toBe(0);
  expect(await (await getCoach()).json()).toEqual({ thread: null, revision: 1 });
  expect((await clearCoach(req({ expectedRevision: 0 }))).status).toBe(409);
});

it('concurrent Coach replies commit one exchange and charge only the winner', async () => {
  let arrived = 0;
  let release!: () => void;
  const both = new Promise<void>((resolve) => {
    release = resolve;
  });
  deps.run.mockImplementation(async () => {
    if (++arrived === 2) release();
    await both;
    return { ok: true, result: { reply: 'Reply', actions: [] } };
  });
  const responses = await Promise.all([
    coach(req({ document: driver, message: 'One' })),
    coach(req({ document: driver, message: 'Two' })),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const current = await deps.store.getCoachState('u');
  expect(current.revision).toBe(1);
  expect(current.thread?.messages).toHaveLength(2);
  expect((await deps.store.getUsage('u', 'month'))['ai.action']).toBe(1);
});
