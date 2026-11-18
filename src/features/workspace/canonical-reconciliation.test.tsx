import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Children, isValidElement, type ReactNode } from 'react';
import type { WorkspaceContextValue } from '@/features/workspace/context';

// A commit-capable hook runner: SSR alone skips the canonical synchronization effect.
// Keep hook slots during prop updates, and discard only slots on an explicit remount.
const hooks = vi.hoisted(() => ({
  index: 0,
  slots: [] as { value?: unknown; deps?: unknown[]; cleanup?: () => void }[],
  layout: [] as (() => void)[],
  effects: [] as (() => void)[],
  context: {} as WorkspaceContextValue,
  radios: new Map<string, () => void>(),
  buttons: new Map<string, { disabled: boolean; click: () => void | Promise<void> }>(),
  checks: new Map<string, { value: boolean; change: (value: boolean) => void }>(),
  account: { status: 'signedIn', user: { uid: 'alice', name: 'Alice' } },
  fields: new Map<string, { value: string; change: (e: { target: { value: string } }) => void }>(),
}));
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  const changed = (a?: unknown[], b?: unknown[]) =>
    !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
  const memo = (fn: () => unknown, deps?: unknown[]) => {
    const slot = (hooks.slots[hooks.index++] ??= {});
    if (changed(slot.deps, deps)) {
      slot.value = fn();
      slot.deps = deps;
    }
    return slot.value;
  };
  const effect = (queue: (() => void)[], fn: () => void | (() => void), deps?: unknown[]) => {
    const slot = (hooks.slots[hooks.index++] ??= {});
    if (changed(slot.deps, deps)) {
      queue.push(() => {
        slot.cleanup?.();
        slot.cleanup = fn() || undefined;
      });
      slot.deps = deps;
    }
  };
  return {
    ...react,
    useContext: (context: Parameters<typeof react.useContext>[0]) =>
      // Other UI contexts continue to use React's normal defaults.
      'routeKey' in ((context as unknown as { _currentValue: object })._currentValue ?? {})
        ? hooks.context
        : react.useContext(context),
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
    useState: (initial: unknown) => {
      const slot = (hooks.slots[hooks.index++] ??= {
        value: typeof initial === 'function' ? initial() : initial,
      });
      const set = (next: unknown) => {
        slot.value = typeof next === 'function' ? next(slot.value) : next;
      };
      return [slot.value, set];
    },
    useRef: (initial: unknown) => memo(() => ({ current: initial }), []),
    useMemo: memo,
    useCallback: (fn: unknown, deps?: unknown[]) => memo(() => fn, deps),
    useLayoutEffect: (fn: () => void | (() => void), deps?: unknown[]) =>
      effect(hooks.layout, fn, deps),
    useEffect: (fn: () => void | (() => void), deps?: unknown[]) => effect(hooks.effects, fn, deps),
  };
});
vi.mock('@/features/account/account-context', () => ({
  useAccount: () => hooks.account,
  useRepositoryVersion: () => 0,
}));
vi.mock('@/features/account/entitlements', () => ({
  useEntitlements: () => ({
    ent: { plan: 'premium', features: {}, limits: {} },
    refresh: () => {},
  }),
}));
vi.mock('@/features/workspace/navigation', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  useWorkspaceRouter: () => ({ push: () => {}, replace: () => {} }),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/i18n/client', () => ({ useT: () => (s: string) => s, useLang: () => 'en' }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: () => {} }) }));
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled: boolean;
    onClick: () => void | Promise<void>;
  }) => {
    hooks.buttons.set(String(children), { disabled: !!disabled, click: onClick });
    return <button disabled={disabled}>{children}</button>;
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
    hooks.fields.set(label, { value, change: onChange });
    return <span>{value}</span>;
  };
  return { TextField: Field, TextArea: Field };
});
vi.mock('@/features/editor/fields', () => ({
  CheckboxField: ({
    label,
    checked,
    onChange,
  }: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }) => {
    hooks.checks.set(label, { value: checked, change: onChange });
    return <span>{label}</span>;
  },
}));
vi.mock('@/features/letters/scaled-page', () => ({
  ScaledPage: () => null,
  resolvePage: () => ({}),
}));
vi.mock('@/modules/letters/build-letter', () => ({ buildLetterHtml: () => '' }));
vi.mock('@/modules/storage/repository', async () => {
  const { driver } = await import('@/modules/resume/fixtures');
  const repo = { list: () => [driver], get: () => driver, subscribe: () => () => {} };
  return { getRepository: () => repo };
});
vi.mock('@/features/portfolio/portfolio-extras', () => ({
  ProjectsEditor: () => null,
  QrCard: () => null,
  SectionsEditor: () => null,
  ThemePicker: () => null,
}));
vi.mock('@/features/jobs/job-tools', () => ({ JobTools: () => null }));
vi.mock('@/features/jobs/company-brief', () => ({ CompanyBrief: () => null }));
vi.mock('@/features/jobs/reminders-card', () => ({ RemindersCard: () => null }));
vi.mock('@/features/export/pack-dialog', () => ({ PackButton: () => null }));

import { WorkspaceStore } from './store';
import { MemoryWorkspacePersistence } from './storage';
import { SavedLetterEditor } from '@/features/letters/letter-screen';
import { PortfolioSettings } from '@/features/portfolio/portfolio-settings';
import { JobDetail, JobDetailForm } from '@/features/jobs/job-detail';
import { savedLetter } from '@/modules/letters/schema';
import { job as jobSchema } from '@/modules/jobs/schema';

let store: WorkspaceStore;
function unmount() {
  hooks.slots.forEach((slot) => slot.cleanup?.());
  hooks.slots = [];
  hooks.effects = [];
  hooks.layout = [];
}
function commit(element: ReactNode) {
  hooks.index = 0;
  hooks.fields.clear();
  hooks.buttons.clear();
  hooks.checks.clear();
  hooks.radios.clear();
  // Inspect native tone controls in the real editor's element tree before SSR drops handlers.
  const tree =
    isValidElement(element) && element.type === SavedLetterEditor
      ? SavedLetterEditor(element.props as Parameters<typeof SavedLetterEditor>[0])
      : element;
  const visit = (node: ReactNode) =>
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) return;
      const props = child.props as { role?: string; children?: ReactNode; onClick?: () => void };
      if (child.type === 'button' && props.role === 'radio' && props.onClick)
        hooks.radios.set(String(props.children), props.onClick);
      visit(props.children);
    });
  visit(tree);
  const html = renderToStaticMarkup(tree);
  hooks.layout.splice(0).forEach((effect) => effect());
  hooks.effects.splice(0).forEach((effect) => effect());
  return html;
}
function settle(element: ReactNode) {
  commit(element);
  commit(element);
  return commit(element);
}
const edit = (label: string, value: string) =>
  hooks.fields.get(label)!.change({ target: { value } });
const feature = (key: string) => store.getTab(store.active().id)!.features[`/portfolio:${key}`];
const response = (value: unknown) => new Response(JSON.stringify(value));
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const letter = () => ({
  ...savedLetter.parse({
    id: 'letter-1',
    type: 'cover',
    subject: 'Original',
    greeting: 'Hello',
    paragraphs: ['Original text'],
    createdAt: '',
    updatedAt: '',
  }),
  revision: 2,
});
const job = () => ({
  ...jobSchema.parse({
    id: 'job-1',
    title: 'Engineer',
    notes: 'Original notes',
    createdAt: '',
    updatedAt: '',
  }),
  revision: 2,
});
const portfolio = () => ({
  slug: 'alice-page',
  docId: 'cv-1',
  published: true,
  showEmail: true,
  showPhone: true,
  contact: true,
  theme: 'auto',
  sections: [],
  projects: [],
  views: 0,
  recent: [],
  createdAt: '',
  updatedAt: '2026-11-18T00:00:00Z',
});

beforeEach(async () => {
  store = await WorkspaceStore.open('alice', new MemoryWorkspacePersistence(), null, '/portfolio');
  hooks.context = {
    store,
    tabId: store.active().id,
    ownerUid: 'alice',
    scopeKey: 'origin',
    routeKey: '/portfolio',
    enabled: true,
    loading: false,
  };
  hooks.account.status = 'signedIn';
  vi.stubGlobal('window', { location: { origin: 'https://test.invalid' } });
  vi.stubGlobal('fetch', async () => response({ designs: [] }));
});
afterEach(() => {
  unmount();
  store.invalidate({ preserve: false });
  vi.unstubAllGlobals();
});

describe.each([false, true])('canonical reconciliation enabled=%s', (enabled) => {
  beforeEach(() => {
    if (!enabled) hooks.context = { ...hooks.context, store: null, tabId: null, enabled: false };
  });

  it('refreshes clean letter fields and tone without making the server PDF dirty', () => {
    const initial = letter();
    settle(<SavedLetterEditor initial={initial} />);
    const next = { ...initial, subject: 'Remote subject', tone: 'formal' as const, revision: 3 };
    const html = settle(<SavedLetterEditor initial={next} />);
    expect(hooks.fields.get('Subject')!.value).toBe('Remote subject');
    expect(html).toMatch(/aria-checked="true"[^>]*>Formal/);
    expect(hooks.buttons.get('Download PDF')!.disabled).toBe(false);
    if (enabled)
      expect(feature('letters.Editor.draft')).toMatchObject({
        dirty: false,
        baseline: { value: { subject: 'Remote subject' } },
      });
  });

  it('keeps conflicting letter input, merges clean fields and compares download status to latest canonical', () => {
    const initial = letter();
    settle(<SavedLetterEditor initial={initial} />);
    edit('Greeting', 'My greeting');
    settle(<SavedLetterEditor initial={initial} />);
    const next = {
      ...initial,
      greeting: 'Remote greeting',
      subject: 'Remote subject',
      revision: 3,
    };
    settle(<SavedLetterEditor initial={next} />);
    expect(hooks.fields.get('Greeting')!.value).toBe('My greeting');
    expect(hooks.fields.get('Subject')!.value).toBe('Remote subject');
    expect(hooks.buttons.get('Download PDF')!.disabled).toBe(true);
    edit('Greeting', 'Remote greeting');
    settle(<SavedLetterEditor initial={next} />);
    expect(hooks.buttons.get('Download PDF')!.disabled).toBe(false);
    if (enabled) expect(feature('letters.Editor.draft')!.dirty).toBe(false);
  });

  it('does not regress a letter save when an older canonical prop arrives', async () => {
    const initial = letter();
    settle(<SavedLetterEditor initial={initial} />);
    edit('Subject', 'Saved locally');
    settle(<SavedLetterEditor initial={initial} />);
    vi.stubGlobal('fetch', async () =>
      response({ letter: { ...initial, subject: 'Saved locally', revision: 5 } }),
    );
    await hooks.buttons.get('Save letter')!.click();
    settle(<SavedLetterEditor initial={{ ...initial, subject: 'Stale GET', revision: 3 }} />);
    expect(hooks.fields.get('Subject')!.value).toBe('Saved locally');
    expect(hooks.buttons.get('Download PDF')!.disabled).toBe(false);
  });

  it('merges a normalized letter save while preserving edits made during the request', async () => {
    const initial = letter();
    settle(<SavedLetterEditor initial={initial} />);
    edit('Subject', ' submitted ');
    settle(<SavedLetterEditor initial={initial} />);
    let done!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>((resolve) => {
          done = resolve;
        }),
    );
    const pending = hooks.buttons.get('Save letter')!.click();
    edit('Greeting', 'Newer input');
    done(response({ letter: { ...initial, subject: 'submitted', revision: 3 } }));
    await pending;
    settle(<SavedLetterEditor initial={initial} />);
    expect(hooks.fields.get('Greeting')!.value).toBe('Newer input');
    expect(hooks.fields.get('Subject')!.value).toBe('submitted');
    expect(hooks.buttons.get('Download PDF')!.disabled).toBe(true);
    edit('Greeting', initial.greeting);
    settle(<SavedLetterEditor initial={initial} />);
    expect(hooks.buttons.get('Download PDF')!.disabled).toBe(false);
    if (enabled) expect(feature('letters.Editor.draft')!.dirty).toBe(false);
  });

  it('preserves an unsaved letter tone and updates the canonical tone baseline', () => {
    const initial = letter();
    settle(<SavedLetterEditor initial={initial} />);
    hooks.radios.get('Formal')!();
    settle(<SavedLetterEditor initial={initial} />);
    const next = { ...initial, subject: 'Remote title', revision: 3 };
    const html = settle(<SavedLetterEditor initial={next} />);
    expect(html).toMatch(/aria-checked="true"[^>]*>Formal/);
    expect(hooks.buttons.get('Download PDF')!.disabled).toBe(true);
    hooks.radios.get('Warm')!();
    settle(<SavedLetterEditor initial={next} />);
    expect(hooks.buttons.get('Download PDF')!.disabled).toBe(false);
    if (enabled) expect(feature('letters.Editor.tone')!.dirty).toBe(false);
  });

  it('does not let a late letter save regress a newer fetched revision', async () => {
    const initial = letter();
    settle(<SavedLetterEditor initial={initial} />);
    edit('Subject', 'Submitted');
    settle(<SavedLetterEditor initial={initial} />);
    let done!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>((resolve) => {
          done = resolve;
        }),
    );
    const pending = hooks.buttons.get('Save letter')!.click();
    const next = {
      ...initial,
      subject: 'Remote subject',
      greeting: 'Newest greeting',
      revision: 5,
    };
    settle(<SavedLetterEditor initial={next} />);
    done(response({ letter: { ...initial, subject: 'Submitted', revision: 4 } }));
    await pending;
    settle(<SavedLetterEditor initial={next} />);
    expect(hooks.fields.get('Greeting')!.value).toBe('Newest greeting');
    expect(hooks.fields.get('Subject')!.value).toBe('Submitted');
    expect(hooks.buttons.get('Download PDF')!.disabled).toBe(true);
    edit('Subject', 'Remote subject');
    settle(<SavedLetterEditor initial={next} />);
    expect(hooks.buttons.get('Download PDF')!.disabled).toBe(false);
  });

  it('merges a newer job stage while preserving unsaved notes', () => {
    const initial = job();
    settle(<JobDetailForm initial={initial} />);
    edit('Notes', 'My notes');
    settle(<JobDetailForm initial={initial} />);
    const next = { ...initial, stage: 'applied' as const, title: 'Remote title', revision: 3 };
    const html = settle(<JobDetailForm initial={next} />);
    expect(hooks.fields.get('Job title')!.value).toBe('Remote title');
    expect(hooks.fields.get('Notes')!.value).toBe('My notes');
    expect(html).toMatch(/aria-checked="true"[^>]*>Applied/);
    edit('Notes', initial.notes);
    settle(<JobDetailForm initial={next} />);
    expect(hooks.buttons.get('Save changes')!.disabled).toBe(true);
    if (enabled) expect(feature('jobs.JobDetail.draft')!.dirty).toBe(false);
  });

  it('merges a normalized job save without losing typing during the request', async () => {
    const initial = job();
    settle(<JobDetailForm initial={initial} />);
    edit('Job title', ' Submitted ');
    settle(<JobDetailForm initial={initial} />);
    let done!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>((resolve) => {
          done = resolve;
        }),
    );
    const pending = hooks.buttons.get('Save changes')!.click();
    edit('Notes', 'Later notes');
    done(response({ job: { ...initial, title: 'Submitted', revision: 3 } }));
    await pending;
    settle(<JobDetailForm initial={initial} />);
    expect(hooks.fields.get('Job title')!.value).toBe('Submitted');
    expect(hooks.fields.get('Notes')!.value).toBe('Later notes');
    edit('Notes', initial.notes);
    settle(<JobDetailForm initial={initial} />);
    expect(hooks.buttons.get('Save changes')!.disabled).toBe(true);
    if (enabled) expect(feature('jobs.JobDetail.draft')!.dirty).toBe(false);
  });

  it('ignores an older job save response after canonical fields have advanced', async () => {
    const initial = job();
    settle(<JobDetailForm initial={initial} />);
    edit('Notes', 'Submitted notes');
    settle(<JobDetailForm initial={initial} />);
    let done!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>((resolve) => {
          done = resolve;
        }),
    );
    const pending = hooks.buttons.get('Save changes')!.click();
    const next = { ...initial, title: 'Newest title', revision: 5 };
    settle(<JobDetailForm initial={next} />);
    done(response({ job: { ...initial, notes: 'Submitted notes', revision: 4 } }));
    await pending;
    settle(<JobDetailForm initial={next} />);
    expect(hooks.fields.get('Job title')!.value).toBe('Newest title');
    expect(hooks.fields.get('Notes')!.value).toBe('Submitted notes');
    if (enabled) expect(feature('jobs.JobDetail.job')!.value).toMatchObject({ revision: 5 });
  });

  it('refreshes portfolio privacy while keeping an unrelated unsaved address', async () => {
    const initial = portfolio();
    vi.stubGlobal('fetch', async () => response({ portfolio: initial }));
    settle(<PortfolioSettings />);
    await tick();
    settle(<PortfolioSettings />);
    edit('Your address', 'my-unsaved-address');
    settle(<PortfolioSettings />);
    // Reauthentication refreshes the same mounted fallback form; tabs also survive remount.
    if (enabled) unmount();
    else {
      hooks.account.status = 'signedOut';
      settle(<PortfolioSettings />);
      hooks.account.status = 'signedIn';
    }
    vi.stubGlobal('fetch', async () =>
      response({
        portfolio: {
          ...initial,
          showEmail: false,
          showPhone: false,
          published: false,
          contact: false,
          updatedAt: '2026-11-19T00:00:00Z',
        },
      }),
    );
    settle(<PortfolioSettings />);
    await tick();
    settle(<PortfolioSettings />);
    expect(hooks.fields.get('Your address')!.value).toBe('my-unsaved-address');
    expect(hooks.checks.get('Show my email address')!.value).toBe(false);
    expect(hooks.checks.get('Show my phone number')!.value).toBe(false);
    expect(hooks.checks.get('Page is published')!.value).toBe(false);
    if (enabled)
      expect(feature('portfolio.Settings.form')).toMatchObject({
        dirty: true,
        baseline: { value: { published: false } },
      });
  });

  it('merges normalized portfolio saves while keeping newer privacy input', async () => {
    const initial = portfolio();
    vi.stubGlobal('fetch', async () => response({ portfolio: initial }));
    settle(<PortfolioSettings />);
    await tick();
    settle(<PortfolioSettings />);
    edit('Your address', 'submitted-address');
    settle(<PortfolioSettings />);
    let done!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>((resolve) => {
          done = resolve;
        }),
    );
    const pending = hooks.buttons.get('Save changes')!.click();
    hooks.checks.get('Show my email address')!.change(false);
    done(
      response({
        portfolio: { ...initial, slug: 'normalized-address', updatedAt: '2026-11-19T00:00:00Z' },
      }),
    );
    await pending;
    settle(<PortfolioSettings />);
    expect(hooks.fields.get('Your address')!.value).toBe('normalized-address');
    expect(hooks.checks.get('Show my email address')!.value).toBe(false);
    expect(hooks.buttons.get('Save changes')!.disabled).toBe(false);
    if (enabled)
      expect(feature('portfolio.Settings.form')).toMatchObject({
        dirty: true,
        baseline: { value: { slug: 'normalized-address' } },
      });
  });

  it('keeps late portfolio GET from replacing a completed local save', async () => {
    const initial = portfolio();
    vi.stubGlobal('fetch', async () => response({ portfolio: initial }));
    settle(<PortfolioSettings />);
    await tick();
    settle(<PortfolioSettings />);
    let done!: (r: Response) => void;
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) =>
      init.method === 'PUT'
        ? Promise.resolve(
            response({
              portfolio: { ...initial, slug: 'local-save', updatedAt: '2026-11-19T00:00:00Z' },
            }),
          )
        : new Promise<Response>((resolve) => {
            done = resolve;
          }),
    );
    settle(<PortfolioSettings />);
    edit('Your address', 'local-save');
    settle(<PortfolioSettings />);
    const pending = hooks.buttons.get('Save changes')!.click();
    hooks.account.status = 'signedOut';
    settle(<PortfolioSettings />);
    hooks.account.status = 'signedIn';
    settle(<PortfolioSettings />);
    await pending;
    done(response({ portfolio: initial }));
    await tick();
    settle(<PortfolioSettings />);
    expect(hooks.fields.get('Your address')!.value).toBe('local-save');
    expect(hooks.buttons.get('Save changes')!.disabled).toBe(true);
  });
});

describe('restored canonical snapshots', () => {
  it('refreshes a clean restored portfolio instead of republishing stale privacy', async () => {
    const initial = portfolio();
    vi.stubGlobal('fetch', async () => response({ portfolio: initial }));
    settle(<PortfolioSettings />);
    await tick();
    settle(<PortfolioSettings />);
    edit('Your address', 'saved-address');
    settle(<PortfolioSettings />);
    vi.stubGlobal('fetch', async () =>
      response({ portfolio: { ...initial, slug: 'saved-address' } }),
    );
    await hooks.buttons.get('Save changes')!.click();
    unmount();
    vi.stubGlobal('fetch', async () =>
      response({
        portfolio: {
          ...initial,
          slug: 'server-address',
          showEmail: false,
          published: false,
          updatedAt: '2026-11-19T00:00:00Z',
        },
      }),
    );
    settle(<PortfolioSettings />);
    await tick();
    settle(<PortfolioSettings />);
    expect(hooks.fields.get('Your address')!.value).toBe('server-address');
    expect(hooks.checks.get('Show my email address')!.value).toBe(false);
    expect(hooks.buttons.get('Save changes')!.disabled).toBe(true);
    expect(feature('portfolio.Settings.form')!.dirty).toBe(false);
  });

  it('requires review before saving a legacy draft whose privacy baseline is unknown', async () => {
    store.writeFeature(
      store.active().id,
      '/portfolio:portfolio.Settings.form',
      { ...portfolio(), slug: 'my-draft' },
      true,
    );
    vi.stubGlobal('fetch', async () =>
      response({ portfolio: { ...portfolio(), showEmail: false, published: false } }),
    );
    settle(<PortfolioSettings />);
    await tick();
    settle(<PortfolioSettings />);
    expect(hooks.fields.get('Your address')!.value).toBe('my-draft');
    expect(hooks.buttons.get('Save changes')!.disabled).toBe(true);
    expect(hooks.buttons.has('Keep my edits')).toBe(true);
    await hooks.buttons.get('Keep my edits')!.click();
    settle(<PortfolioSettings />);
    expect(hooks.buttons.get('Save changes')!.disabled).toBe(false);
  });

  it.each(['pending', 'offline', 'http-error'])(
    'blocks restored portfolio saves while canonical refresh is %s',
    async (failure) => {
      const initial = portfolio();
      vi.stubGlobal('fetch', async () => response({ portfolio: initial }));
      settle(<PortfolioSettings />);
      await tick();
      settle(<PortfolioSettings />);
      edit('Your address', 'unsaved-address');
      settle(<PortfolioSettings />);
      unmount();
      let fetched!: (r: Response) => void;
      let reject!: (error: Error) => void;
      const request = vi.fn((_url: string, init: RequestInit) =>
        init.method === 'PUT'
          ? Promise.resolve(response({ portfolio: initial }))
          : new Promise<Response>((resolve, fail) => {
              fetched = resolve;
              reject = fail;
            }),
      );
      vi.stubGlobal('fetch', request);
      settle(<PortfolioSettings />);
      if (failure === 'offline') reject(new Error('Offline'));
      if (failure === 'http-error')
        fetched(
          new Response(JSON.stringify({ error: { message: 'Unavailable' } }), { status: 503 }),
        );
      await tick();
      settle(<PortfolioSettings />);
      expect(hooks.buttons.get('Save changes')!.disabled).toBe(true);
      await hooks.buttons.get('Save changes')!.click();
      expect(request.mock.calls.filter(([, init]) => init.method === 'PUT')).toHaveLength(0);
      expect(hooks.fields.get('Your address')!.value).toBe('unsaved-address');
      if (failure === 'pending') {
        fetched(
          response({
            portfolio: {
              ...initial,
              published: false,
              showEmail: false,
              updatedAt: '2026-11-19T00:00:00Z',
            },
          }),
        );
        await tick();
        settle(<PortfolioSettings />);
        expect(hooks.checks.get('Page is published')!.value).toBe(false);
        expect(hooks.checks.get('Show my email address')!.value).toBe(false);
        expect(hooks.buttons.get('Save changes')!.disabled).toBe(false);
      }
    },
  );
  it('does not accept a late empty GET after a save completes across a remount', async () => {
    const initial = portfolio();
    vi.stubGlobal('fetch', async () => response({ portfolio: initial }));
    settle(<PortfolioSettings />);
    await tick();
    settle(<PortfolioSettings />);
    edit('Your address', 'local-save');
    settle(<PortfolioSettings />);
    let saved!: (r: Response) => void;
    let fetched!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          if (init.method === 'PUT') saved = resolve;
          else fetched = resolve;
        }),
    );
    const pending = hooks.buttons.get('Save changes')!.click();
    unmount();
    settle(<PortfolioSettings />);
    saved(
      response({
        portfolio: { ...initial, slug: 'local-save', updatedAt: '2026-11-19T00:00:00Z' },
      }),
    );
    await pending;
    fetched(response({ portfolio: null }));
    await tick();
    settle(<PortfolioSettings />);
    expect(hooks.buttons.has('Create my page')).toBe(false);
    expect(hooks.buttons.get('Save changes')!.disabled).toBe(true);
    expect(hooks.fields.get('Your address')!.value).toBe('local-save');
  });

  it('refreshes restored letter fields and tone using the previous canonical record', () => {
    const initial = letter();
    settle(<SavedLetterEditor initial={initial} />);
    edit('Greeting', 'My greeting');
    settle(<SavedLetterEditor initial={initial} />);
    unmount();
    const next = { ...initial, subject: 'Updated remotely', tone: 'formal' as const, revision: 3 };
    const html = settle(<SavedLetterEditor initial={next} />);
    expect(hooks.fields.get('Subject')!.value).toBe('Updated remotely');
    expect(hooks.fields.get('Greeting')!.value).toBe('My greeting');
    expect(html).toMatch(/aria-checked="true"[^>]*>Formal/);
  });

  it('accepts a newer job GET and merges clean fields without losing restored edits', async () => {
    const initial = job();
    vi.stubGlobal('fetch', async () => response({ job: initial }));
    settle(<JobDetail id="job-1" />);
    await tick();
    settle(<JobDetail id="job-1" />);
    edit('Notes', 'My notes');
    settle(<JobDetail id="job-1" />);
    unmount();
    vi.stubGlobal('fetch', async () =>
      response({ job: { ...initial, title: 'Remote title', notes: 'Remote notes', revision: 3 } }),
    );
    settle(<JobDetail id="job-1" />);
    await tick();
    settle(<JobDetail id="job-1" />);
    expect(hooks.fields.get('Job title')!.value).toBe('Remote title');
    expect(hooks.fields.get('Notes')!.value).toBe('My notes');
    expect(feature('jobs.JobDetail.draft')).toMatchObject({
      dirty: true,
      baseline: { value: { title: 'Remote title' } },
    });
  });

  it('ignores a late job GET older than a local save and preserves later typing', async () => {
    const initial = job();
    vi.stubGlobal('fetch', async () => response({ job: initial }));
    settle(<JobDetail id="job-1" />);
    await tick();
    settle(<JobDetail id="job-1" />);
    unmount();
    let done!: (r: Response) => void;
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) =>
      init.method === 'PUT'
        ? Promise.resolve(response({ job: { ...initial, title: 'Saved locally', revision: 5 } }))
        : new Promise<Response>((resolve) => {
            done = resolve;
          }),
    );
    settle(<JobDetail id="job-1" />);
    edit('Job title', 'Saved locally');
    settle(<JobDetail id="job-1" />);
    await hooks.buttons.get('Save changes')!.click();
    edit('Notes', 'Later input');
    done(response({ job: { ...initial, title: 'Stale GET', revision: 3 } }));
    await tick();
    settle(<JobDetail id="job-1" />);
    expect(hooks.fields.get('Job title')!.value).toBe('Saved locally');
    expect(hooks.fields.get('Notes')!.value).toBe('Later input');
    expect(feature('jobs.JobDetail.job')!.value).toMatchObject({ revision: 5 });
  });
});
