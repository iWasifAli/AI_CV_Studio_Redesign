import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryUserStore } from '@/modules/store/memory';
import { jobInput } from './schema';
import { driver } from '@/modules/resume/fixtures';
const deps = vi.hoisted(() => ({
  store: null as unknown as MemoryUserStore,
  run: vi.fn(),
  prepare: vi.fn(),
  release: vi.fn(),
  done: vi.fn(),
}));
vi.mock('@/modules/store', () => ({ getUserStore: () => deps.store }));
vi.mock('@/modules/jobs/ai-route', () => ({ prepareJobAi: deps.prepare }));
vi.mock('@/modules/ai/run', () => ({ runTask: deps.run }));
vi.mock('@/modules/metrics/activity', () => ({ noteUse: async () => {} }));
vi.mock('@/modules/stories/server', () => ({ storiesForAi: async () => [] }));
vi.mock('@/modules/billing/server', () => ({
  getBusinessConfig: async () => ({
    value: {
      features: { companyBrief: true, kit: true, mockInterview: true },
      aiWeights: { brief: 1, kit: 3, mockTurn: 1 },
    },
  }),
}));
import { POST as match } from '@/app/api/jobs/[id]/match/route';
import { POST as brief } from '@/app/api/jobs/[id]/brief/route';
import { POST as letter } from '@/app/api/jobs/[id]/letter/route';
import { POST as kit } from '@/app/api/jobs/[id]/kit/route';
import { POST as interview } from '@/app/api/jobs/[id]/interview/route';
import { POST as turn } from '@/app/api/jobs/[id]/interview/turn/route';
const output = {
  summary: 'Suggestion',
  headline: '',
  order: [],
  skills: [],
  requirements: [],
  keywords: [],
  questions: [],
  tips: [],
  company: 'Acme',
  values: [],
  needs: [],
  fit: [],
  greeting: 'Hello',
  paragraphs: ['Generated'],
  closing: 'Regards',
  email: { subject: 'Role', body: 'Hi' },
  feedback: {
    verdict: 'good',
    star: { situation: true, task: true, action: true, result: true },
    quote: '',
    strengths: [],
    improve: [],
    tip: '',
  },
  next: { question: 'Question?', kind: 'situation' },
};
beforeEach(async () => {
  vi.clearAllMocks();
  deps.store = new MemoryUserStore();
  await deps.store.putJob('u', {
    ...jobInput.parse({ title: 'Driver', advert: 'Advert' }),
    id: 'j',
    createdAt: 'now',
    updatedAt: 'now',
  });
  deps.prepare.mockImplementation(async () => ({
    user: { uid: 'u' },
    job: await deps.store.getJob('u', 'j'),
    doc: driver,
    body: {},
    rid: 'rid',
    deps: {},
    done: deps.done,
    release: deps.release,
  }));
  deps.run.mockImplementation(async () => {
    await deps.store.updateJob('u', 'j', (j) => ({ ...j, notes: 'Newer edit' }));
    return { ok: true, result: output, findings: [] };
  });
});
it.each([
  ['match', match],
  ['brief', brief],
  ['letter', letter],
  ['kit', kit],
  ['interview', interview],
  ['mock', turn],
] as const)(
  '%s keeps a stale generated suggestion and refunds the reservation',
  async (_name, route) => {
    const response = await route(new Request('http://localhost', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ id: 'j' }),
    });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.details.current.notes).toBe('Newer edit');
    expect(body.error.details.generated).toBeTruthy();
    expect(deps.release).toHaveBeenCalledOnce();
    expect((await deps.store.getJob('u', 'j'))?.match).toBeUndefined();
  },
);

it.each([
  ['match', match],
  ['brief', brief],
  ['letter', letter],
  ['kit', kit],
  ['interview', interview],
  ['mock', turn],
] as const)('%s commits one revision when generation is current', async (name, route) => {
  deps.run.mockResolvedValue({ ok: true, result: output, findings: [] });
  const response = await route(new Request('http://localhost', { method: 'POST', body: '{}' }), {
    params: Promise.resolve({ id: 'j' }),
  });
  expect(response.status).toBe(200);
  expect((await response.json()).job.revision).toBe(2);
  expect(deps.run).toHaveBeenCalledTimes(name === 'kit' ? 2 : 1);
  expect(deps.release).not.toHaveBeenCalled();
});
