import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { driver } from '@/modules/resume/fixtures';
import type { Job } from './schema';
import type { Reminder } from './reminders';
import { advance } from './mock';

const deps = vi.hoisted(() => ({
  store: {
    getJob: vi.fn(),
    putJob: vi.fn(),
    updateJob: vi.fn(),
    getDoc: vi.fn(),
    listJobs: vi.fn(),
    getReminderQueue: vi.fn(),
    putReminderQueue: vi.fn(),
    takeLease: vi.fn(),
    dueReminderQueues: vi.fn(),
    userLang: vi.fn(),
  },
  prepare: vi.fn(),
  loadReminder: vi.fn(),
  run: vi.fn(),
  done: vi.fn(),
  noteUse: vi.fn(),
  track: vi.fn(),
  sendMail: vi.fn(),
}));
vi.mock('@/modules/store', () => ({ getUserStore: () => deps.store }));
vi.mock('@/modules/identity/session', () => ({
  currentUser: async () => ({ uid: 'u', email: 'a@example.com' }),
}));
vi.mock('@/modules/jobs/ai-route', () => ({ prepareJobAi: deps.prepare }));
vi.mock('@/modules/jobs/reminder-route', () => ({ loadJobForReminders: deps.loadReminder }));
vi.mock('@/modules/ai/run', () => ({ runTask: deps.run }));
vi.mock('@/modules/metrics/activity', () => ({ noteUse: deps.noteUse }));
vi.mock('@/modules/metrics/server', () => ({ track: deps.track }));
vi.mock('@/modules/billing/server', () => ({
  getBusinessConfig: async () => ({
    value: {
      features: { companyBrief: true, kit: true, mockInterview: true, reminders: true },
      aiWeights: { brief: 1, kit: 3, mockTurn: 1 },
      support: { email: 'support@example.com' },
    },
  }),
}));
vi.mock('@/modules/notify/server', () => ({
  SITE: 'https://example.com',
  reminderEmail: () => ({ subject: 'Reminders' }),
  sendMail: deps.sendMail,
}));
vi.mock('@/modules/stories/server', () => ({ storiesForAi: async () => [] }));

import { PUT } from '@/app/api/jobs/[id]/route';
import { POST as match } from '@/app/api/jobs/[id]/match/route';
import { POST as brief } from '@/app/api/jobs/[id]/brief/route';
import { POST as letter } from '@/app/api/jobs/[id]/letter/route';
import { POST as kit } from '@/app/api/jobs/[id]/kit/route';
import { POST as interview } from '@/app/api/jobs/[id]/interview/route';
import { POST as turn } from '@/app/api/jobs/[id]/interview/turn/route';
import { POST as addReminder } from '@/app/api/jobs/[id]/reminders/route';
import {
  PUT as editReminder,
  DELETE as deleteReminder,
} from '@/app/api/jobs/[id]/reminders/[rid]/route';
import { runReminders } from './reminders-server';

const now = '2026-11-18T12:00:00.000Z';
const base = (over: Partial<Job> = {}): Job => ({
  id: 'j',
  title: 'Driver',
  company: 'Acme',
  location: '',
  url: '',
  advert: 'Advert',
  stage: 'saved',
  outcome: '',
  notes: '',
  appliedOn: '',
  documentIds: [],
  interviewNotes: [],
  createdAt: now,
  updatedAt: now,
  ...over,
});
const reminder = (id: string, over: Partial<Reminder> = {}): Reminder => ({
  id,
  on: '2026-11-18',
  note: 'Follow up',
  done: false,
  dueAt: '2026-11-18T08:00:00.000Z',
  emailedAt: '',
  createdAt: now,
  ...over,
});
const output = {
  summary: 'Summary',
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
  greeting: 'Dear team,',
  paragraphs: ['A letter'],
  closing: 'Regards,',
  email: { subject: 'Role', body: 'Hello' },
  feedback: {
    verdict: 'good' as const,
    star: { situation: true, task: true, action: true, result: true },
    quote: '',
    strengths: [],
    improve: [],
    tip: '',
  },
  next: { question: 'Next question?', kind: 'situation' as const },
};
const ctx = () => ({ params: Promise.resolve({ id: 'j', rid: 'a' }) });
const response = (value: Response | undefined): Response => {
  if (!value) throw new Error('The handler did not return a response.');
  return value;
};
const request = (body = {}) =>
  new Request('http://localhost/api/jobs/j', { method: 'POST', body: JSON.stringify(body) });
let loaded: Job;
let current: Job | null;
let duringSave: () => void;
let retry: boolean;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  loaded = base();
  current = structuredClone(loaded);
  duringSave = () => {};
  retry = false;
  deps.store.getJob.mockImplementation(async () => structuredClone(loaded));
  // The boundary double simulates a conflicting transaction and discards its first result.
  deps.store.updateJob.mockImplementation(
    async (uid: string, id: string, edit: (j: Job) => Job | Promise<Job>) => {
      expect([uid, id]).toEqual(['u', 'j']);
      if (retry && current) await edit(structuredClone(current));
      duringSave();
      if (!current) return null;
      current = await edit(structuredClone(current));
      return structuredClone(current);
    },
  );
  deps.store.putJob.mockImplementation(async (_uid: string, job: Job) => {
    duringSave();
    current = structuredClone(job);
  });
  deps.store.getDoc.mockImplementation(async (_uid: string, id: string) => ({
    doc: { ...driver, id, title: `CV ${id}` },
  }));
  deps.store.listJobs.mockImplementation(async () => (current ? [structuredClone(current)] : []));
  const queue = {
    uid: 'u',
    email: 'a@example.com',
    tz: 'UTC',
    off: false,
    token: 'token',
    next: now,
    updatedAt: now,
  };
  deps.store.getReminderQueue.mockResolvedValue(queue);
  deps.store.dueReminderQueues.mockResolvedValue([queue]);
  deps.store.takeLease.mockResolvedValue(true);
  deps.store.userLang.mockResolvedValue('en');
  deps.prepare.mockImplementation(async () => ({
    user: { uid: 'u', email: 'a@example.com' },
    job: structuredClone(loaded),
    doc: driver,
    body: { answer: 'I delivered all parcels on time.' },
    rid: 'req',
    deps: {},
    done: deps.done,
  }));
  deps.loadReminder.mockImplementation(async () => ({
    user: { uid: 'u', email: 'a@example.com' },
    job: structuredClone(loaded),
    rid: 'req',
  }));
  deps.run.mockResolvedValue({ ok: true, result: output, findings: [] });
  deps.sendMail.mockResolvedValue({ ok: true });
});

afterEach(() => vi.useRealTimers());

describe('job update boundary', () => {
  it('patches the latest stage/history and recomputes sent for a move', async () => {
    retry = true;
    duringSave = () => {
      current = base({
        stage: 'interview',
        notes: 'Concurrent note',
        documentIds: ['cv'],
        appliedOn: '2026-11-01',
        reached: { applied: '2026-11-01', interview: '2026-11-02' },
        reminders: [reminder('a')],
      });
    };
    const res = response(await PUT(request({ stage: 'closed', outcome: 'rejected' }), ctx()));
    expect(res.status).toBe(200);
    expect((await res.json()).job).toMatchObject({
      stage: 'closed',
      outcome: 'rejected',
      notes: 'Concurrent note',
      reached: { applied: '2026-11-01', interview: '2026-11-02' },
      sent: { cvId: 'cv' },
      reminders: [{ id: 'a' }],
    });
  });

  it.each([{ appliedOn: '2026-11-01' }, { outcome: 'rejected' }])(
    'recomputes sent for an edit without a stage: %j',
    async (patch) => {
      loaded = base({
        stage: 'closed',
        documentIds: ['old'],
        ...(patch.outcome ? { outcome: 'not_applied', appliedOn: '2026-11-01' } : {}),
      });
      current = structuredClone(loaded);
      duringSave = () => {
        current = { ...current!, documentIds: ['new'], notes: 'Keep me' };
      };
      const res = response(await PUT(request(patch), ctx()));
      expect(res.status).toBe(200);
      expect((await res.json()).job).toMatchObject({
        notes: 'Keep me',
        sent: { cvId: 'new' },
        ...patch,
      });
    },
  );

  it('returns the existing validation envelope without saving invalid input', async () => {
    const res = response(await PUT(request({ outcome: 'invalid' }), ctx()));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_INPUT');
    expect(current).toEqual(loaded);
  });

  const routes = [
    ['match', match],
    ['brief', brief],
    ['letter', letter],
    ['kit', kit],
    ['interview', interview],
    ['mock turn', turn],
  ] as const;
  it.each(routes)(
    '%s preserves concurrent changes, and external work runs once on retry',
    async (_name, route) => {
      retry = true;
      duringSave = () => {
        current = {
          ...current!,
          stage: 'offer',
          notes: 'New note',
          reminders: [reminder('new')],
          reached: { offer: '2026-11-18' },
        };
      };
      const res = response(await route(request(), ctx()));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.job).toMatchObject({
        stage: 'offer',
        notes: 'New note',
        reminders: [{ id: 'new' }],
        reached: { offer: '2026-11-18' },
      });
      const field = {
        match: 'match',
        brief: 'brief',
        letter: 'letter',
        kit: 'kit',
        interview: 'interview',
        'mock turn': 'mock',
      }[_name];
      expect(body.job).toHaveProperty(field);
      expect(deps.run).toHaveBeenCalledTimes(_name === 'kit' ? 2 : 1);
      expect(deps.done).toHaveBeenCalledTimes(1);
      expect(deps.noteUse).toHaveBeenCalledTimes(1);
    },
  );

  it.each([['PUT', PUT], ...routes] as const)(
    '%s refuses a job deleted before saving (AI preserves a conflict suggestion)',
    async (_name, route) => {
      duringSave = () => {
        current = null;
      };
      const res = response(await route(request(), ctx()));
      expect(res.status).toBe(_name === 'PUT' ? 404 : 409);
      const error = (await res.json()).error;
      expect(error.code).toBe(_name === 'PUT' ? 'NOT_FOUND' : 'CONFLICT');
      if (_name !== 'PUT')
        expect(error.details).toMatchObject({ current: null, generated: expect.any(Object) });
      expect(current).toBeNull();
    },
  );

  it('appends the kit CV to the latest links within ten and refreshes sent', async () => {
    // The browser has not saved the returned tailored CV yet; snapshot the latest existing CV.
    deps.store.getDoc.mockImplementation(async (_uid: string, id: string) =>
      /^cv\d$/.test(id) ? { doc: { ...driver, id, title: `CV ${id}` } } : null,
    );
    duringSave = () => {
      current = base({
        stage: 'applied',
        documentIds: Array.from({ length: 10 }, (_, i) => `cv${i}`),
      });
    };
    const res = response(await kit(request(), ctx()));
    const body = await res.json();
    expect(body.job.documentIds).toEqual([
      'cv1',
      'cv2',
      'cv3',
      'cv4',
      'cv5',
      'cv6',
      'cv7',
      'cv8',
      'cv9',
      body.document.id,
    ]);
    expect(body.job.sent.cvId).toBe('cv9');
    expect(body.job.letter.documentId).toBe(body.document.id);
  });

  it.each(['answer', 'restart', 'start'])(
    'rejects a stale mock %s instead of overwriting a newer session',
    async (mode) => {
      loaded = base({ ...(mode === 'start' ? {} : { mock: advance(undefined, output, '') }) });
      current = structuredClone(loaded);
      if (mode === 'restart')
        deps.prepare.mockImplementationOnce(async () => ({
          user: { uid: 'u' },
          job: structuredClone(loaded),
          doc: driver,
          body: { restart: true },
          rid: 'req',
          deps: {},
          done: deps.done,
        }));
      duringSave = () => {
        current = {
          ...current!,
          mock: advance(
            undefined,
            { ...output, next: { ...output.next, question: 'A newer question' } },
            '',
          ),
        };
      };
      const res = response(await turn(request(), ctx()));
      expect(res.status).toBe(409);
      expect(current?.mock?.current?.question).toBe('A newer question');
    },
  );

  it('rejects an older answer even when the later turn asks the same question', async () => {
    loaded = base({ mock: advance(undefined, output, '') });
    current = structuredClone(loaded);
    duringSave = () => {
      current = {
        ...current!,
        mock: advance(loaded.mock, output, 'The newer answer was already saved.'),
      };
    };
    const res = response(await turn(request(), ctx()));
    expect(res.status).toBe(409);
    expect(current?.mock?.turns).toHaveLength(1);
    expect(current?.mock?.turns[0]?.answer).toBe('The newer answer was already saved.');
  });

  it('finishes a mock using the latest history and caps it at five entries', async () => {
    loaded = base({ mock: advance(undefined, output, '') });
    current = structuredClone(loaded);
    deps.run.mockResolvedValueOnce({
      ok: true,
      result: { ...output, next: { ...output.next, question: '' } },
      findings: [],
    });
    retry = true;
    duringSave = () => {
      current = {
        ...current!,
        mockPast: Array.from({ length: 5 }, (_, i) => ({
          at: `past${i}`,
          verdicts: ['good'],
          summary: `Past ${i}`,
        })),
      };
    };
    const res = response(await turn(request(), ctx()));
    expect(res.status).toBe(200);
    const { job } = await res.json();
    expect(job.mock.current).toBeNull();
    expect(job.mockPast).toHaveLength(5);
    expect(job.mockPast[0]).toMatchObject({ at: now, verdicts: ['good'], summary: 'Summary' });
    expect(job.mockPast[1]).toEqual({ at: 'past0', verdicts: ['good'], summary: 'Past 0' });
    expect(job.mockPast[4].at).toBe('past3');
  });
});

describe('reminder update boundaries', () => {
  it('adds to latest reminders and preserves concurrent job edits', async () => {
    retry = true;
    duringSave = () => {
      current = base({ stage: 'offer', company: 'New company', reminders: [reminder('new')] });
    };
    const res = response(await addReminder(request({ on: '2026-11-19', tz: 'UTC' }), ctx()));
    expect(res.status).toBe(200);
    const { job } = await res.json();
    expect(job.stage).toBe('offer');
    expect(job.reminders).toHaveLength(2);
    expect(job.reminders[0].id).toBe('new');
    expect(job.reminders[1].note).toBe('Follow up with New company');
    expect(deps.track).toHaveBeenCalledExactlyOnceWith('reminder_set');
    expect(deps.store.putReminderQueue).toHaveBeenCalledTimes(1);
  });

  it('checks the open reminder cap again when the transaction retries', async () => {
    retry = true;
    duringSave = () => {
      current = base({ reminders: Array.from({ length: 10 }, (_, i) => reminder(`${i}`)) });
    };
    const res = response(await addReminder(request({ on: '2026-11-19', tz: 'UTC' }), ctx()));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatchObject({
      code: 'LIMIT_REACHED',
      details: { reason: 'limit' },
    });
    expect(current?.reminders).toHaveLength(10);
    expect(deps.track).not.toHaveBeenCalled();
  });

  it('edits only the selected reminder fields on latest and keeps new reminders', async () => {
    loaded = base({ reminders: [reminder('a')] });
    current = structuredClone(loaded);
    duringSave = () => {
      current = base({
        notes: 'New note',
        reminders: [
          reminder('a', { note: 'New reminder note', emailedAt: 'sent' }),
          reminder('new'),
        ],
      });
    };
    const res = response(await editReminder(request({ done: true }), ctx()));
    expect(res.status).toBe(200);
    expect((await res.json()).job).toMatchObject({
      notes: 'New note',
      reminders: [
        { id: 'a', note: 'New reminder note', done: true, emailedAt: 'sent' },
        { id: 'new' },
      ],
    });
  });

  it('cannot edit a reminder that was deleted during processing', async () => {
    loaded = base({ reminders: [reminder('a')] });
    current = structuredClone(loaded);
    duringSave = () => {
      current = base({ reminders: [reminder('new')] });
    };
    const res = response(await editReminder(request({ done: true }), ctx()));
    expect(res.status).toBe(404);
    expect(current?.reminders?.map((r) => r.id)).toEqual(['new']);
  });

  it('cannot reopen a done reminder when concurrent additions filled the cap', async () => {
    loaded = base({ reminders: [reminder('a', { done: true })] });
    current = structuredClone(loaded);
    duringSave = () => {
      current = base({
        reminders: [
          reminder('a', { done: true }),
          ...Array.from({ length: 10 }, (_, i) => reminder(`${i}`)),
        ],
      });
    };
    const res = response(await editReminder(request({ done: false }), ctx()));
    expect(res.status).toBe(402);
    expect(current?.reminders?.[0]?.done).toBe(true);
  });

  it('deletes by latest ID and keeps concurrently added reminders', async () => {
    loaded = base({ reminders: [reminder('a')] });
    current = structuredClone(loaded);
    duringSave = () => {
      current = base({ notes: 'Keep', reminders: [reminder('a'), reminder('new')] });
    };
    const res = response(await deleteReminder(request(), ctx()));
    expect(res.status).toBe(200);
    expect((await res.json()).job).toMatchObject({ notes: 'Keep', reminders: [{ id: 'new' }] });
  });

  it.each([
    ['add', addReminder],
    ['edit', editReminder],
    ['delete', deleteReminder],
  ])('%s returns 404 when the job is deleted', async (_name, route) => {
    loaded = base({ reminders: [reminder('a')] });
    current = structuredClone(loaded);
    duringSave = () => {
      current = null;
    };
    const res = response(await route(request({ on: '2026-11-19', done: true }), ctx()));
    expect(res.status).toBe(404);
    expect(current).toBeNull();
  });

  it.each([true, false])(
    'digest stamps only still-pending matching IDs, preserving latest state (mail=%s)',
    async (send) => {
      current = base({ reminders: ['a', 'done', 'deleted', 'stamped'].map((id) => reminder(id)) });
      if (!send)
        deps.store.dueReminderQueues.mockResolvedValue([
          { uid: 'u', email: null, off: true, tz: 'UTC', token: 'token' },
        ]);
      retry = true;
      duringSave = () => {
        current = base({
          stage: 'offer',
          updatedAt: 'keep timestamp',
          reminders: [
            reminder('a', { note: 'New note' }),
            reminder('done', { done: true }),
            reminder('stamped', { emailedAt: 'original stamp' }),
            reminder('new'),
          ],
        });
      };
      await runReminders(new Date(now));
      expect(current).toMatchObject({
        stage: 'offer',
        updatedAt: 'keep timestamp',
        reminders: [
          { id: 'a', note: 'New note', emailedAt: send ? now : `off:${now}` },
          { id: 'done', done: true, emailedAt: '' },
          { id: 'stamped', emailedAt: 'original stamp' },
          { id: 'new', emailedAt: '' },
        ],
      });
      expect(deps.sendMail).toHaveBeenCalledTimes(send ? 1 : 0);
    },
  );

  it('digest skips a job deleted during email delivery', async () => {
    current = base({ reminders: [reminder('a')] });
    deps.sendMail.mockImplementationOnce(async () => {
      current = null;
      return { ok: true };
    });
    await runReminders(new Date(now));
    expect(current).toBeNull();
    expect(deps.store.putReminderQueue).toHaveBeenLastCalledWith(
      expect.objectContaining({ next: null }),
    );
  });
});
