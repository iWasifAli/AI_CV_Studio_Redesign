import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';

// Contract double: snapshot setters and task callbacks keep their originating route/tab.
const workspace = vi.hoisted(() => ({
  scope: 'tab-a',
  values: new Map<string, unknown>(),
  buttons: new Map<string, () => Promise<void> | void>(),
  fields: new Map<string, (event: { target: { value: string } }) => void>(),
  tasks: new Map<string, Promise<unknown>>(),
  clean: new Set<string>(),
  routes: new Map<string, string>(),
}));
vi.mock('@/features/workspace/context', () => ({
  useWorkspaceState: (key: string, initial: unknown) => {
    const fullKey = `${workspace.scope}:${key}`;
    if (!workspace.values.has(fullKey))
      workspace.values.set(fullKey, typeof initial === 'function' ? initial() : initial);
    return [
      workspace.values.get(fullKey),
      (next: unknown) =>
        workspace.values.set(
          fullKey,
          typeof next === 'function' ? next(workspace.values.get(fullKey)) : next,
        ),
    ];
  },
  useWorkspaceTask: () => {
    const scope = workspace.scope;
    return (key: string, fn: (signal: AbortSignal) => Promise<unknown>) => {
      const taskKey = `${scope}:${key}`;
      const pending = workspace.tasks.get(taskKey);
      if (pending) return pending;
      const result = fn(new AbortController().signal).finally(() =>
        workspace.tasks.delete(taskKey),
      );
      workspace.tasks.set(taskKey, result);
      return result;
    };
  },
  useWorkspace: () => ({
    ownerUid: 'alice',
    tabId: workspace.scope,
    routeKey: 'route',
    store: {
      flush: async () => {},
      isLive: () => true,
      getTab: (tab: string) => ({
        features: Object.fromEntries(
          [...workspace.values]
            .filter(([key]) => key.startsWith(`${tab}:`))
            .map(([key, value]) => [
              `route:${key.slice(tab.length + 1)}`,
              { version: 1, value, dirty: true, updatedAt: 0 },
            ]),
        ),
      }),
      markClean: (tab: string, _prefix: string, expected: Record<string, { value: unknown }>) => {
        if (
          Object.entries(expected).every(
            ([key, snapshot]) =>
              JSON.stringify(workspace.values.get(`${tab}:${key.replace(/^route:/, '')}`)) ===
              JSON.stringify(snapshot.value),
          )
        )
          workspace.clean.add(tab);
      },
      readFeature: (tab: string, key: string) =>
        workspace.values.get(`${tab}:${key.replace(/^route:/, '')}`),
    },
  }),
  useWorkspaceClean: () => {
    const scope = workspace.scope;
    return () => workspace.clean.add(scope);
  },
  useWorkspaceDownload: () => () => {},
}));
vi.mock('@/features/workspace/navigation', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  useWorkspaceRouter: () => {
    const scope = workspace.scope;
    return {
      push: (href: string) => workspace.routes.set(scope, href),
      replace: (href: string) => workspace.routes.set(scope, href),
    };
  },
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('type=cover') }));
vi.mock('@/i18n/client', () => ({ useT: () => (s: string) => s, useLang: () => 'en' }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick: () => Promise<void> | void }) => {
    workspace.buttons.set(`${workspace.scope}:${String(children)}`, onClick);
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
    workspace.fields.set(`${workspace.scope}:${label}`, onChange);
    return <span>{value}</span>;
  };
  return { TextArea: Field, TextField: Field };
});
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: () => {} }) }));
vi.mock('@/features/account/entitlements', () => ({
  useEntitlements: () => ({ ent: null, refresh: () => {} }),
}));
vi.mock('@/features/account/account-context', () => ({
  useRepositoryVersion: () => 0,
  useAccount: () => ({ status: 'signedIn', user: { uid: 'alice', name: 'Alice' } }),
}));
vi.mock('./job-tools', () => ({ JobTools: () => null }));
vi.mock('./company-brief', () => ({ CompanyBrief: () => null }));
vi.mock('./reminders-card', () => ({ RemindersCard: () => null }));
vi.mock('@/features/export/pack-dialog', () => ({ PackButton: () => null }));

import { JobDetail } from './job-detail';
import { job as jobSchema } from '@/modules/jobs/schema';
import { SavedLetterEditor } from '@/features/letters/letter-screen';
import { savedLetter } from '@/modules/letters/schema';

beforeEach(() => {
  vi.stubGlobal('confirm', () => true);
  workspace.scope = 'tab-a';
  workspace.values.clear();
  workspace.buttons.clear();
  workspace.fields.clear();
  workspace.tasks.clear();
  workspace.clean.clear();
  workspace.routes.clear();
});
afterEach(() => vi.unstubAllGlobals());
const baseJob = () => ({
  ...jobSchema.parse({ id: 'job-1', title: 'Engineer', createdAt: '', updatedAt: '' }),
  revision: 4,
});
const seedJob = (scope: string, notes: string) => {
  const job = baseJob();
  workspace.values.set(`${scope}:jobs.JobDetail.job`, job);
  workspace.values.set(`${scope}:jobs.JobDetail.draft`, {
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    advert: job.advert,
    stage: job.stage,
    outcome: '',
    notes,
    appliedOn: '',
    documentIds: [],
  });
};
const notes = (scope: string) =>
  (workspace.values.get(`${scope}:jobs.JobDetail.draft`) as { notes: string }).notes;

describe('job detail workspace adapter', () => {
  it('finishes a save in its original tab while retaining edits made after a remount', async () => {
    seedJob('tab-a', 'submitted');
    seedJob('tab-b', 'other tab');
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    renderToStaticMarkup(<JobDetail id="job-1" />);
    const pending = workspace.buttons.get('tab-a:Save changes')!();
    // Remount the same origin while its request is running, then edit again.
    renderToStaticMarkup(<JobDetail id="job-1" />);
    workspace.fields.get('tab-a:Notes')!({ target: { value: 'later edit' } });
    renderToStaticMarkup(<JobDetail id="job-1" />);
    const joined = workspace.buttons.get('tab-a:Save changes')!();
    workspace.scope = 'tab-b';
    renderToStaticMarkup(<JobDetail id="job-1" />);
    resolve(
      new Response(JSON.stringify({ job: { ...baseJob(), notes: 'submitted', revision: 5 } })),
    );
    await Promise.all([pending, joined]);
    expect(notes('tab-a')).toBe('later edit');
    expect(notes('tab-b')).toBe('other tab');
    expect(workspace.values.get('tab-a:jobs.JobDetail.job')).toMatchObject({ revision: 5 });
    expect(workspace.clean.has('tab-a')).toBe(false);
  });
  it('preserves a rejected draft and requires explicit acceptance of the new revision', async () => {
    seedJob('tab-a', 'my draft');
    const current = { ...baseJob(), notes: 'remote edit', revision: 7 };
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ error: { message: 'Changed', details: { current } } }), {
          status: 409,
        }),
    );
    renderToStaticMarkup(<JobDetail id="job-1" />);
    await workspace.buttons.get('tab-a:Save changes')!();
    expect(notes('tab-a')).toBe('my draft');
    expect(workspace.values.get('tab-a:jobs.JobDetail.job')).toMatchObject({ revision: 4 });
    expect(workspace.clean.size).toBe(0);
    renderToStaticMarkup(<JobDetail id="job-1" />);
    await workspace.buttons.get('tab-a:Keep my draft against this version')!();
    expect(notes('tab-a')).toBe('my draft');
    expect(workspace.values.get('tab-a:jobs.JobDetail.job')).toMatchObject({ revision: 7 });
  });
  it('marks an unchanged successfully saved form clean', async () => {
    seedJob('tab-a', 'my draft');
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ job: { ...baseJob(), notes: 'my draft', revision: 5 } })),
    );
    renderToStaticMarkup(<JobDetail id="job-1" />);
    await workspace.buttons.get('tab-a:Save changes')!();
    expect(workspace.clean.has('tab-a')).toBe(true);
  });
});

describe('saved letter workspace adapter', () => {
  it('retains the current draft when AI finishes and applies the suggestion only on request', async () => {
    const initial = {
      ...savedLetter.parse({
        id: 'letter-1',
        type: 'cover',
        subject: 'Original',
        paragraphs: ['My draft'],
        createdAt: '',
        updatedAt: '',
      }),
      revision: 2,
    };
    const generated = { ...initial, paragraphs: ['Generated suggestion'], revision: 3 };
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    renderToStaticMarkup(<SavedLetterEditor initial={initial} />);
    const label = [...workspace.buttons.keys()].find((key) =>
      /new draft|Write.*AI|Redraft/i.test(key),
    );
    expect(label).toBeDefined();
    workspace.buttons.get(label!)!();
    renderToStaticMarkup(<SavedLetterEditor initial={initial} />);
    workspace.fields.get('tab-a:Greeting')!({ target: { value: 'My newer greeting' } });
    resolve(new Response(JSON.stringify({ letter: generated })));
    await Promise.all(workspace.tasks.values());
    expect(workspace.values.get('tab-a:letters.Editor.draft')).toMatchObject({
      paragraphs: ['My draft'],
      greeting: 'My newer greeting',
    });
    expect(workspace.values.get('tab-a:letters.Editor.suggestion')).toMatchObject({
      paragraphs: ['Generated suggestion'],
    });
    renderToStaticMarkup(<SavedLetterEditor initial={initial} />);
    await workspace.buttons.get('tab-a:Use generated draft')!();
    expect(workspace.values.get('tab-a:letters.Editor.draft')).toMatchObject({
      paragraphs: ['Generated suggestion'],
    });
  });
});

import { NewLetter } from '@/features/letters/new-letter';
import { LETTER_TYPE } from '@/modules/letters/types';

describe('new letter creation', () => {
  const fill = () =>
    workspace.values.set(
      'tab-a:letters.LetterForm.answers',
      Object.fromEntries(LETTER_TYPE.cover.questions.map((q) => [q.id, 'My answer'])),
    );
  it('reuses a persisted creation intent after an uncertain response and remount', async () => {
    fill();
    const keys: (string | null)[] = [];
    vi.stubGlobal('fetch', async (_: string, init: RequestInit) => {
      keys.push(new Headers(init.headers).get('Idempotency-Key'));
      if (keys.length === 1) throw new TypeError('Connection lost');
      return new Response(JSON.stringify({ letter: { id: 'created-letter', revision: 0 } }));
    });
    renderToStaticMarkup(<NewLetter />);
    await workspace.buttons.get('tab-a:Write it myself')!();
    const intent = workspace.values.get('tab-a:letters.LetterForm.intent');
    expect(intent).toMatchObject({ key: expect.any(String) });
    renderToStaticMarkup(<NewLetter />);
    await workspace.buttons.get('tab-a:Write it myself')!();
    expect(keys[1]).toBe(keys[0]);
    expect(workspace.values.get('tab-a:letters.LetterForm.created')).toMatchObject({
      id: 'created-letter',
    });
  });
  it('keeps completed creation and navigation with the original tab', async () => {
    fill();
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    renderToStaticMarkup(<NewLetter />);
    const pending = workspace.buttons.get('tab-a:Write it myself')!();
    workspace.scope = 'tab-b';
    renderToStaticMarkup(<NewLetter />);
    await Promise.resolve(); // Creation starts after its recovery receipt has flushed.
    resolve(new Response(JSON.stringify({ letter: { id: 'created-letter', revision: 0 } })));
    await pending;
    expect(workspace.values.get('tab-a:letters.LetterForm.created')).toMatchObject({
      id: 'created-letter',
    });
    expect(workspace.values.get('tab-b:letters.LetterForm.created')).toBeNull();
    expect(workspace.routes.get('tab-a')).toBe('/letters/created-letter');
    expect(workspace.routes.has('tab-b')).toBe(false);
  });
});
