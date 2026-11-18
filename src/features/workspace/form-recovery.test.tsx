import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import type { WorkspaceContextValue } from '@/features/workspace/context';

// A commit-capable hook runner: SSR alone skips the canonical synchronization effect.
// Keep hook slots during prop updates, and discard only slots on an explicit remount.
const hooks = vi.hoisted(() => ({
  index: 0,
  slots: [] as { value?: unknown; deps?: unknown[]; cleanup?: () => void }[],
  layout: [] as (() => void)[],
  effects: [] as (() => void)[],
  context: {} as WorkspaceContextValue,
  buttons: new Map<string, () => Promise<unknown> | void>(),
  forms: [] as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> }[],
  radios: [] as { checked: boolean; onChange: () => void }[],
  params: new URLSearchParams(),
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

vi.mock('react/jsx-runtime', async (original) => {
  const runtime = await original<typeof import('react/jsx-runtime')>();
  const capture =
    (fn: typeof runtime.jsx): typeof runtime.jsx =>
    (type, props, key) => {
      const attributes = props as Record<string, unknown>;
      if (type === 'form' && attributes.onSubmit) hooks.forms.push(attributes as never);
      if (type === 'input' && attributes.name === 'target') hooks.radios.push(attributes as never);
      return fn(type, props, key);
    };
  return { ...runtime, jsx: capture(runtime.jsx), jsxs: capture(runtime.jsxs) };
});
vi.mock('react/jsx-dev-runtime', async (original) => {
  const runtime = await original<typeof import('react/jsx-dev-runtime')>();
  return {
    ...runtime,
    jsxDEV: (...args: Parameters<typeof runtime.jsxDEV>) => {
      const [type, props] = args;
      const attributes = props as Record<string, unknown>;
      if (type === 'form' && attributes.onSubmit) hooks.forms.push(attributes as never);
      if (type === 'input' && attributes.name === 'target') hooks.radios.push(attributes as never);
      return runtime.jsxDEV(...args);
    },
  };
});
vi.mock('@/features/account/account-context', () => ({
  useAccount: () => ({ status: 'signedIn', user: { uid: 'alice' } }),
  useRepositoryVersion: () => 0,
}));
vi.mock('@/features/account/entitlements', () => ({
  useEntitlements: () => ({ ent: null, refresh: () => {} }),
}));
vi.mock('@/features/workspace/link-menu', () => ({ WorkspaceLinkMenu: () => null }));
vi.mock('@/features/workspace/navigation', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  useWorkspaceRouter: () => ({ push: () => {}, replace: () => {} }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({}),
  usePathname: () => hooks.context.routeKey,
  useSearchParams: () => hooks.params,
}));
vi.mock('@/i18n/client', () => ({ useT: () => (s: string) => s, useLang: () => 'en' }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: () => {} }) }));
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick: () => Promise<unknown> | void;
  }) => {
    hooks.buttons.set(String(children), onClick);
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
    hooks.fields.set(label, { value, change: onChange });
    return <span>{value}</span>;
  };
  return { TextField: Field, TextArea: Field };
});
vi.mock('@/modules/storage/repository', async () => {
  const { driver } = await import('@/modules/resume/fixtures');
  const repo = { list: () => [driver], get: () => driver };
  return { getRepository: () => repo };
});
vi.mock('@/features/jobs/enhanced-board', () => ({ EnhancedBoard: () => null }));
vi.mock('@/features/skills/career-paths', () => ({ CareerPaths: () => null }));

import { WorkspaceStore } from './store';
import { MemoryWorkspacePersistence } from './storage';
import { NewLetter } from '@/features/letters/new-letter';
import { JobsBoard } from '@/features/jobs/jobs-board';
import { StoryBank } from '@/features/stories/story-bank';
import { SkillPlans } from '@/features/skills/skill-plans';
import { LETTER_TYPE } from '@/modules/letters/types';
import { job as jobSchema } from '@/modules/jobs/schema';
import { storyInput } from '@/modules/stories/schema';

let store: WorkspaceStore;
let persistence: MemoryWorkspacePersistence;
const job = jobSchema.parse({ id: 'job-1', title: 'Engineer', createdAt: '', updatedAt: '' });
const story = {
  ...storyInput.parse({ title: 'Saved story', action: 'I improved it.' }),
  id: 'story-1',
  createdAt: '',
  updatedAt: '',
};
const response = (body: unknown) => new Response(JSON.stringify(body));
const key = (name: string) => `${hooks.context.routeKey}:${name}`;
const feature = (name: string) => store.active().features[key(name)]!;
const seed = (name: string, value: unknown, baseline?: unknown) =>
  store.writeFeature(
    store.active().id,
    key(name),
    value,
    baseline !== undefined,
    baseline !== undefined ? { value: baseline } : undefined,
  );
const event = { preventDefault: () => {} };
function unmount() {
  hooks.slots.forEach((slot) => slot.cleanup?.());
  hooks.slots = [];
}
function commit(node: ReactNode) {
  hooks.index = 0;
  hooks.fields.clear();
  hooks.buttons.clear();
  hooks.forms = [];
  hooks.radios = [];
  const html = renderToStaticMarkup(node);
  hooks.layout.splice(0).forEach((effect) => effect());
  hooks.effects.splice(0).forEach((effect) => effect());
  return html;
}
async function settle(node: ReactNode) {
  commit(node);
  await new Promise((resolve) => setTimeout(resolve, 0));
  commit(node);
}
async function setup(route: string, params = '') {
  persistence = new MemoryWorkspacePersistence();
  store = await WorkspaceStore.open('alice', persistence, null, route);
  hooks.context = {
    store,
    tabId: store.active().id,
    ownerUid: 'alice',
    scopeKey: 'origin',
    routeKey: route,
    enabled: true,
    loading: false,
  };
  hooks.params = new URLSearchParams(params);
}
beforeEach(() => {
  hooks.layout = [];
  hooks.effects = [];
  vi.stubGlobal('window', { location: { origin: 'https://test.invalid' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        if (url === '/api/jobs') return response({ job });
        if (url === '/api/stories') return response({ story });
        return response({ letter: { id: 'letter-1', revision: 0 } });
      }
      if (url === '/api/jobs') return response({ jobs: [job], max: 10 });
      if (url === '/api/stories') return response({ stories: [], max: 10, enabled: true });
      return response({ plans: [], max: 10, enabled: true });
    }),
  );
});
afterEach(() => {
  unmount();
  store?.invalidate({ preserve: false });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const flows = [
  {
    name: 'letter',
    route: '/letters/new',
    params: 'type=cover',
    intent: 'letters.LetterForm.intent',
    node: () => <NewLetter />,
    fill: () =>
      seed(
        'letters.LetterForm.answers',
        Object.fromEntries(LETTER_TYPE.cover.questions.map((q) => [q.id, 'My answer'])),
        {},
      ),
    submit: () => hooks.buttons.get('Write it myself')!() as Promise<void>,
  },
  {
    name: 'job',
    route: '/jobs',
    params: 'new=1',
    intent: 'jobs.AddJob.intent',
    node: () => <JobsBoard />,
    fill: () => seed('jobs.AddJob.title', 'Engineer', ''),
    submit: () => hooks.forms[0]!.onSubmit(event),
  },
];
describe.each(flows)('$name creation recovery', (flow) => {
  it('commits the intent before POST and reuses its key after durable restore', async () => {
    await setup(flow.route, flow.params);
    flow.fill();
    await settle(flow.node());
    const save = persistence.save.bind(persistence);
    let release!: () => void;
    vi.spyOn(persistence, 'save').mockImplementationOnce(
      (snapshot, epoch) =>
        new Promise<void>((resolve) => {
          release = () => {
            void save(snapshot, epoch).then(resolve);
          };
        }),
    );
    const fetch = vi.mocked(globalThis.fetch);
    const sent: string[] = [];
    fetch.mockImplementation(async (_url, init) => {
      const receipt = new Headers(init?.headers).get('Idempotency-Key');
      if (!receipt) return response({ jobs: [job], max: 10 });
      const durable = await persistence.load('alice', store.getSnapshot().session.instanceId);
      expect(durable?.tabs[0]?.features[key(flow.intent)]?.value).toMatchObject({ key: receipt });
      sent.push(receipt);
      throw new TypeError('Response lost after server creation');
    });
    const pending = flow.submit();
    await Promise.resolve();
    expect(sent).toEqual([]);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    expect(release).toBeTypeOf('function');
    release();
    await pending;
    expect(sent).toHaveLength(1);
    const instance = store.getSnapshot().session.instanceId;
    unmount();
    store.invalidate({ preserve: false });
    store = await WorkspaceStore.open('alice', persistence, instance, flow.route);
    hooks.context = { ...hooks.context, store, tabId: store.active().id };
    await settle(flow.node());
    await flow.submit();
    expect(sent).toEqual([sent[0], sent[0]]);
  });
  it('does not create after the account ends while persistence is pending', async () => {
    await setup(flow.route, flow.params);
    flow.fill();
    await settle(flow.node());
    let release!: () => void;
    vi.spyOn(persistence, 'save').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = flow.submit();
    await Promise.resolve();
    expect(release).toBeTypeOf('function');
    store.invalidate({ preserve: false });
    release();
    await pending;
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(
      0,
    );
  });
  it('does not send creation if the receipt cannot be saved', async () => {
    await setup(flow.route, flow.params);
    flow.fill();
    await settle(flow.node());
    vi.spyOn(persistence, 'save').mockRejectedValue(new Error('Storage full'));
    await flow.submit();
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(
      0,
    );
    expect(feature(flow.intent).value).toMatchObject({ key: expect.any(String) });
  });
});

describe('successful form resets', () => {
  it.each([false, true])(
    'acknowledges the cleared story while preserving later input=%s',
    async (later) => {
      await setup('/stories');
      seed('stories.StoryBank.editing', story, null);
      await settle(<StoryBank />);
      let resolve!: (r: Response) => void;
      vi.mocked(fetch).mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const pending = hooks.buttons.get('Save story')!();
      if (later) hooks.fields.get('Title')!.change({ target: { value: 'Newer edit' } });
      resolve(response({ story }));
      await pending;
      expect(feature('stories.StoryBank.editing').value).toEqual(
        later ? { ...story, title: 'Newer edit' } : null,
      );
      expect(feature('stories.StoryBank.editing').dirty).toBe(later);
      if (!later)
        expect(
          store.active().features[key('stories.StoryBank.editing')]?.baseline?.value,
        ).toBeNull();
    },
  );
  it.each([false, true])(
    'keeps a cancelled story clean when cancellation follows save completion=%s',
    async (afterSave) => {
      await setup('/stories');
      seed('stories.StoryBank.editing', story, null);
      await settle(<StoryBank />);
      let resolve!: (r: Response) => void;
      vi.mocked(fetch).mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const pending = hooks.buttons.get('Save story')!();
      hooks.fields.get('Title')!.change({ target: { value: 'Newer edit' } });
      if (afterSave) {
        resolve(response({ story }));
        await pending;
        commit(<StoryBank />);
      }
      hooks.buttons.get('Cancel')!();
      if (!afterSave) {
        resolve(response({ story }));
        await pending;
      }
      expect(feature('stories.StoryBank.editing').value).toBeNull();
      expect(feature('stories.StoryBank.editing').dirty).toBe(false);
    },
  );
  it.each([false, true])(
    'acknowledges cleared job fields while preserving later input=%s',
    async (later) => {
      await setup('/jobs', 'new=1');
      seed('jobs.AddJob.title', 'Engineer', '');
      seed('jobs.AddJob.url', 'https://example.org/job', 'https://example.org/job');
      await settle(<JobsBoard />);
      let resolve!: (r: Response) => void;
      vi.mocked(fetch).mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const pending = hooks.forms[0]!.onSubmit(event);
      await new Promise((done) => setTimeout(done, 0));
      if (later) hooks.fields.get('Job title')!.change({ target: { value: 'Newer edit' } });
      resolve(response({ job }));
      await pending;
      expect(feature('jobs.AddJob.title').value).toBe(later ? 'Newer edit' : '');
      expect(feature('jobs.AddJob.title').dirty).toBe(later);
      expect(feature('jobs.AddJob.url').value).toBe('');
      expect(feature('jobs.AddJob.url').dirty).toBe(false);
    },
  );
});

describe('skill plan target selection', () => {
  it('uses role mode when no saved jobs are available', async () => {
    await setup('/skills');
    vi.mocked(fetch).mockImplementation(async (url) =>
      response(url === '/api/jobs' ? { jobs: [], max: 10 } : { plans: [], max: 10, enabled: true }),
    );
    await settle(<SkillPlans />);
    expect(hooks.radios).toHaveLength(1);
    expect(hooks.radios[0]!.checked).toBe(true);
    expect(hooks.fields.has('The role')).toBe(true);
  });
  it.each(['', 'role=Planner'])(
    'allows selecting a saved job with retained role text (%s)',
    async (params) => {
      await setup('/skills', params);
      await settle(<SkillPlans />);
      if (!params) {
        hooks.radios[1]!.onChange();
        commit(<SkillPlans />);
        hooks.fields.get('The role')!.change({ target: { value: 'Planner' } });
        commit(<SkillPlans />);
      }
      expect(hooks.radios[1]!.checked).toBe(true);
      hooks.radios[0]!.onChange();
      const html = commit(<SkillPlans />);
      expect(hooks.radios[0]!.checked).toBe(true);
      expect(html).not.toMatch(/aria-label="Job"[^>]*disabled/);
      expect(feature('skills.SkillPlans.target').value).toMatchObject({
        kind: 'job',
        role: 'Planner',
      });
      await hooks.buttons.get('Make my plan')!();
      const post = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST');
      expect(JSON.parse(post![1]!.body as string)).toMatchObject({ jobId: job.id });
      expect(JSON.parse(post![1]!.body as string)).not.toHaveProperty('role');
    },
  );
});
