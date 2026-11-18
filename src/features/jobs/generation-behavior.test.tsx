import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';

const ui = vi.hoisted(() => ({
  enabled: true,
  scope: 'origin',
  values: new Map<string, unknown>(),
  buttons: new Map<string, () => unknown>(),
  fields: new Map<string, (e: { target: { value: string } }) => void>(),
  tasks: new Set<Promise<unknown>>(),
}));
// Stateful contract double: local React state has no store; workspace snapshots survive remounts.
vi.mock('@/features/workspace/context', () => ({
  useWorkspaceState: (key: string, initial: unknown) => {
    const fullKey = `${ui.scope}:${key}`;
    if (!ui.values.has(fullKey))
      ui.values.set(fullKey, typeof initial === 'function' ? initial() : initial);
    return [
      ui.values.get(fullKey),
      (next: unknown) =>
        ui.values.set(fullKey, typeof next === 'function' ? next(ui.values.get(fullKey)) : next),
    ];
  },
  useWorkspaceTask: () => (_key: string, work: (signal: AbortSignal) => Promise<unknown>) => {
    const task = work(new AbortController().signal);
    ui.tasks.add(task);
    return task;
  },
  useWorkspace: () => ({
    ownerUid: 'alice',
    tabId: ui.enabled ? ui.scope : null,
    routeKey: '/route',
    store: ui.enabled
      ? {
          isLive: () => true,
          hasFeature: (tab: string, key: string) =>
            ui.values.has(`${tab}:${key.replace(/^\/route:/, '')}`),
          getTab: (tab: string) => ({
            features: Object.fromEntries(
              [...ui.values]
                .filter(([key]) => key.startsWith(`${tab}:`))
                .map(([key, value]) => [
                  `/route:${key.slice(tab.length + 1)}`,
                  { version: 1, value, dirty: false, updatedAt: 0 },
                ]),
            ),
          }),
          // These cases assert generation application; canonical sync tests use the real store.
          markClean: () => {},
          readFeature: (tab: string, key: string) =>
            ui.values.get(`${tab}:${key.replace(/^\/route:/, '')}`),
        }
      : null,
  }),
  useWorkspaceClean: () => () => {},
  useWorkspaceDownload: () => () => {},
}));
vi.mock('@/features/workspace/navigation', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  useWorkspaceRouter: () => ({ push: () => {}, replace: () => {} }),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('new=1') }));
vi.mock('@/i18n/client', () => ({ useT: () => (s: string) => s, useLang: () => 'en' }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick: () => unknown }) => {
    ui.buttons.set(`${ui.scope}:${String(children)}`, onClick);
    return <button>{children}</button>;
  },
  ButtonLink: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/components/ui/field', () => {
  const Field = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (e: { target: { value: string } }) => void;
  }) => {
    ui.fields.set(`${ui.scope}:${label}`, onChange);
    return <span>{value}</span>;
  };
  return { TextField: Field, TextArea: Field };
});
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: () => {} }) }));
vi.mock('@/features/account/entitlements', () => ({
  useEntitlements: () => ({ ent: null, refresh: () => {} }),
}));
vi.mock('@/features/account/account-context', () => ({
  useRepositoryVersion: () => 0,
  useAccount: () => ({ status: 'signedIn', user: { uid: 'alice', name: 'Alice' } }),
}));
vi.mock('@/features/letters/scaled-page', () => ({
  ScaledPage: () => null,
  resolvePage: () => ({}),
}));
vi.mock('@/modules/letters/build-letter', () => ({ buildLetterHtml: () => '' }));
vi.mock('@/modules/storage/repository', async () => {
  const { driver } = await import('@/modules/resume/fixtures');
  const repo = { list: () => [driver], get: () => driver };
  return { getRepository: () => repo };
});
vi.mock('./kit-section', () => ({ KitSection: () => null }));
vi.mock('./mock-interview', () => ({ MockInterview: () => null }));

import { JobTools } from './job-tools';
import { JobsBoard } from './jobs-board';
import { resolveJobBoard } from '@/modules/jobs/board';
import { SavedLetterEditor } from '@/features/letters/letter-screen';
import { job as jobSchema, type Job } from '@/modules/jobs/schema';
import { savedLetter } from '@/modules/letters/schema';

const get = (key: string, scope = 'origin') => ui.values.get(`${scope}:${key}`);
const put = (key: string, value: unknown) => ui.values.set(`${ui.scope}:${key}`, value);
const click = (label: string) => {
  const handler = ui.buttons.get(`${ui.scope}:${label}`);
  expect(handler, label).toBeTypeOf('function');
  return handler!();
};
const finish = () => Promise.all([...ui.tasks]);
const deferred = () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  return (body: unknown, status = 200) => resolve(new Response(JSON.stringify(body), { status }));
};
const question = (text: string) => ({
  at: '',
  sourceTitle: 'CV',
  questions: [{ question: text, kind: 'experience' as const, why: '', points: [], evidence: [] }],
  tips: [],
});
const baseJob = () =>
  jobSchema.parse({
    id: 'job-1',
    title: 'Driver',
    advert: 'A detailed job advert. '.repeat(10),
    createdAt: '',
    updatedAt: '',
    revision: 4,
  });
const baseLetter = () =>
  savedLetter.parse({
    id: 'letter-1',
    type: 'cover',
    subject: 'Application',
    paragraphs: ['Original draft'],
    createdAt: '',
    updatedAt: '',
    revision: 2,
  });

beforeEach(() => {
  ui.enabled = true;
  ui.scope = 'origin';
  ui.values.clear();
  ui.buttons.clear();
  ui.fields.clear();
  ui.tasks.clear();
  vi.stubGlobal('window', { location: { origin: 'https://test.invalid' } });
  vi.stubGlobal('confirm', () => true);
});
afterEach(() => vi.unstubAllGlobals());

describe.each([false, true])('generation with workspace enabled=%s', (enabled) => {
  beforeEach(() => {
    ui.enabled = enabled;
  });
  it('immediately shows interview questions when inputs have not changed', async () => {
    let shown = baseJob();
    const render = () =>
      renderToStaticMarkup(
        <JobTools
          job={shown}
          onJobChange={(next) => {
            shown = next;
          }}
        />,
      );
    render();
    const resolve = deferred();
    click('Prepare for the interview');
    const next = {
      ...shown,
      interview: question('Generated question'),
      interviewNotes: [],
      revision: 5,
    };
    resolve({ job: next });
    await finish();
    expect(shown).toEqual(next);
    expect(render()).toContain('data-testid="interview"');
    expect(render()).toContain('Generated question');
    expect(get('jobs.InterviewPrepSection.suggestion')).toBeNull();
  });
  it('immediately opens the generated job cover letter for editing', async () => {
    let shown = baseJob();
    const render = () =>
      renderToStaticMarkup(
        <JobTools
          job={shown}
          onJobChange={(next) => {
            shown = next;
          }}
        />,
      );
    render();
    const resolve = deferred();
    click('Write a cover letter');
    const letter = {
      ...baseLetter(),
      paragraphs: ['Generated cover letter'],
      email: { subject: '', body: '' },
    };
    resolve({ job: { ...shown, letter }, findings: 0 });
    await finish();
    expect(get('jobs.LetterEditor.draft')).toMatchObject({
      paragraphs: ['Generated cover letter'],
    });
    expect(render()).toContain('data-testid="letter-editor"');
    expect(get('jobs.LetterEditor.suggestion')).toBeNull();
  });
  it('immediately applies a saved-letter redraft when its draft and tone are unchanged', async () => {
    const initial = baseLetter();
    renderToStaticMarkup(<SavedLetterEditor initial={initial} />);
    const resolve = deferred();
    click('Write a new AI draft');
    resolve({ letter: { ...initial, paragraphs: ['Generated saved letter'], revision: 3 } });
    await finish();
    expect(get('letters.Editor.draft')).toMatchObject({ paragraphs: ['Generated saved letter'] });
    expect(get('letters.Editor.suggestion')).toBeNull();
  });
  it.each(['link', 'text'])('fills unchanged add-job fields from %s extraction', async (method) => {
    put('jobs.JobsBoardSession.board', { jobs: [], board: resolveJobBoard([]) });
    put('jobs.AddJob.url', 'https://example.org/job');
    put('jobs.AddJob.advert', 'Pasted advert '.repeat(10));
    renderToStaticMarkup(<JobsBoard />);
    const resolve = deferred();
    click(method === 'link' ? 'Fill in from the link' : 'Fill in from the advert text');
    const extracted = {
      title: 'Extracted driver',
      company: 'Company',
      location: 'Town',
      url: 'https://example.org/job',
      advert: 'Extracted advert',
      via: 'structured',
    };
    resolve({ job: extracted });
    await finish();
    // The form update runs after runTask resolves.
    await Promise.resolve();
    expect(get('jobs.AddJob.title')).toBe('Extracted driver');
    expect(get('jobs.AddJob.advert')).toBe('Extracted advert');
    expect(get('jobs.AddJob.suggestion')).toBeNull();
  });
});

describe('generation after a workspace remount', () => {
  it('automatically applies unchanged interview inputs to the origin while another tab is active', async () => {
    let shown = baseJob();
    const render = () =>
      renderToStaticMarkup(
        <JobTools
          job={shown}
          onJobChange={(next) => {
            shown = next;
          }}
        />,
      );
    render();
    const resolve = deferred();
    click('Prepare for the interview');
    render();
    ui.scope = 'other';
    render();
    const next = {
      ...shown,
      interview: question('Background question'),
      interviewNotes: [],
      revision: 5,
    };
    resolve({ job: next });
    await finish();
    expect(shown).toEqual(next);
    expect(get('jobs.InterviewPrepSection.suggestion')).toBeNull();
    expect(get('jobs.InterviewPrepSection.suggestion', 'other')).toBeNull();
    ui.scope = 'origin';
    expect(render()).toContain('Background question');
  });
  it('retains interview output as a suggestion if the selected CV changes', async () => {
    const shown = baseJob();
    const onJobChange = vi.fn();
    const render = () => renderToStaticMarkup(<JobTools job={shown} onJobChange={onJobChange} />);
    render();
    const resolve = deferred();
    click('Prepare for the interview');
    render();
    put('jobs.JobTools.sourceId', 'different-cv');
    const next = { ...shown, interview: question('Question for the previous CV') };
    resolve({ job: next });
    await finish();
    expect(onJobChange).not.toHaveBeenCalled();
    expect(get('jobs.InterviewPrepSection.suggestion')).toEqual(next);
  });
  it.each(['jobs', 'letters'])(
    'retains %s letter generation when only the tone changes',
    async (kind) => {
      const initial = baseLetter();
      const render = () =>
        renderToStaticMarkup(
          kind === 'jobs' ? (
            <JobTools job={baseJob()} onJobChange={() => {}} />
          ) : (
            <SavedLetterEditor initial={initial} />
          ),
        );
      render();
      const resolve = deferred();
      click(kind === 'jobs' ? 'Write a cover letter' : 'Write a new AI draft');
      render();
      const prefix = kind === 'jobs' ? 'jobs.LetterEditor' : 'letters.Editor';
      put(`${prefix}.tone`, 'formal');
      const letter = {
        ...initial,
        paragraphs: ['Warm generated letter'],
        revision: 3,
        email: { subject: '', body: '' },
      };
      resolve(kind === 'jobs' ? { job: { ...baseJob(), letter } } : { letter });
      await finish();
      expect(get(`${prefix}.tone`)).toBe('formal');
      expect(get(`${prefix}.draft`)).toEqual(
        kind === 'jobs' ? null : expect.objectContaining({ paragraphs: ['Original draft'] }),
      );
      expect(get(`${prefix}.suggestion`)).toMatchObject({ paragraphs: ['Warm generated letter'] });
    },
  );
  it.each(['link', 'text'])(
    'keeps newer add-job fields when %s extraction finishes in the background',
    async (method) => {
      put('jobs.JobsBoardSession.board', { jobs: [], board: resolveJobBoard([]) });
      put('jobs.AddJob.url', 'https://example.org/job');
      put('jobs.AddJob.advert', 'Original pasted advert '.repeat(10));
      const render = () => renderToStaticMarkup(<JobsBoard />);
      render();
      const resolve = deferred();
      const pending = click(
        method === 'link' ? 'Fill in from the link' : 'Fill in from the advert text',
      );
      render();
      ui.fields.get('origin:Job title')!({ target: { value: 'My newer title' } });
      ui.scope = 'other';
      render();
      const extracted = {
        title: 'Extracted title',
        company: 'Company',
        location: 'Town',
        url: 'https://example.org/job',
        advert: 'Extracted advert',
        via: 'structured',
      };
      resolve({ job: extracted });
      await pending;
      expect(get('jobs.AddJob.title')).toBe('My newer title');
      expect(get('jobs.AddJob.advert')).toBe('Original pasted advert '.repeat(10));
      expect(get('jobs.AddJob.suggestion')).toEqual(extracted);
      expect(get('jobs.AddJob.suggestion', 'other')).toBeUndefined();
      ui.scope = 'origin';
      render();
      click('Use advert details');
      expect(get('jobs.AddJob.title')).toBe('Extracted title');
      expect(get('jobs.AddJob.advert')).toBe('Extracted advert');
    },
  );
  it('keeps newer interview notes and retains questions for explicit application', async () => {
    let shown: Job = {
      ...baseJob(),
      interview: question('Original question'),
      interviewNotes: ['Old notes'],
    };
    const render = () =>
      renderToStaticMarkup(
        <JobTools
          job={shown}
          onJobChange={(next) => {
            shown = next;
          }}
        />,
      );
    render();
    const resolve = deferred();
    click('New questions');
    render(); // New hook closures; completion must read the original persisted snapshot.
    ui.fields.get('origin:My answer notes')!({ target: { value: 'Newer answer notes' } });
    ui.scope = 'other';
    render();
    const next = {
      ...shown,
      interview: question('Generated question'),
      interviewNotes: [],
      revision: 5,
    };
    resolve({ job: next });
    await finish();
    expect(shown.interview?.questions[0]?.question).toBe('Original question');
    expect(get('jobs.InterviewPrepSection.notes')).toEqual(['Newer answer notes']);
    expect(get('jobs.InterviewPrepSection.suggestion')).toEqual(next);
    expect(get('jobs.InterviewPrepSection.suggestion', 'other')).toBeNull();
    ui.scope = 'origin';
    render();
    click('Use new questions');
    expect(shown).toEqual(next);
    expect(get('jobs.InterviewPrepSection.notes')).toEqual([]);
  });
  it('retains a job-letter draft edited after generation started', async () => {
    let shown: Job = {
      ...baseJob(),
      letter: { ...baseLetter(), email: { subject: '', body: '' } },
    };
    const render = () =>
      renderToStaticMarkup(
        <JobTools
          job={shown}
          onJobChange={(next) => {
            shown = next;
          }}
        />,
      );
    render();
    const resolve = deferred();
    click('Write a new draft');
    render();
    ui.fields.get('origin:Greeting')!({ target: { value: 'Newer greeting' } });
    resolve({ job: { ...shown, letter: { ...shown.letter, paragraphs: ['Generated cover'] } } });
    await finish();
    expect(get('jobs.LetterEditor.draft')).toMatchObject({ greeting: 'Newer greeting' });
    expect(get('jobs.LetterEditor.suggestion')).toMatchObject({ paragraphs: ['Generated cover'] });
  });
  it('retains a saved-letter draft edited after generation started', async () => {
    const initial = baseLetter();
    const render = () => renderToStaticMarkup(<SavedLetterEditor initial={initial} />);
    render();
    const resolve = deferred();
    click('Write a new AI draft');
    render();
    ui.fields.get('origin:Greeting')!({ target: { value: 'Newer greeting' } });
    resolve({ letter: { ...initial, paragraphs: ['Generated saved letter'], revision: 3 } });
    await finish();
    expect(get('letters.Editor.draft')).toMatchObject({ greeting: 'Newer greeting' });
    expect(get('letters.Editor.suggestion')).toMatchObject({
      paragraphs: ['Generated saved letter'],
    });
  });
  it('does not automatically apply a 409 generated interview response', async () => {
    const shown = baseJob();
    const onJobChange = vi.fn();
    renderToStaticMarkup(<JobTools job={shown} onJobChange={onJobChange} />);
    const resolve = deferred();
    click('Prepare for the interview');
    const details = {
      current: { ...shown, revision: 6 },
      generated: { interview: question('Conflict question') },
    };
    resolve({ error: { message: 'Changed', details } }, 409);
    await finish().catch(() => {});
    await Promise.resolve();
    expect(onJobChange).not.toHaveBeenCalled();
    expect(get('jobs.InterviewPrepSection.conflict')).toEqual(details);
  });
});
