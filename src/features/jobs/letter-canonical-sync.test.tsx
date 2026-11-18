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
  useAccount: () => ({}),
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
  usePathname: () => '/jobs/job-1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/i18n/client', () => ({ useT: () => (s: string) => s, useLang: () => 'en' }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: () => {} }) }));
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

import { WorkspaceStore } from '@/features/workspace/store';
import { MemoryWorkspacePersistence } from '@/features/workspace/storage';
import { job as jobSchema, type Job } from '@/modules/jobs/schema';
import { letter as letterSchema } from '@/modules/letters/schema';
import { JobTools } from './job-tools';

let store: WorkspaceStore;
const fullKey = '/jobs/job-1:jobs.LetterEditor.draft';
const letter = (greeting: string) =>
  letterSchema.parse({ greeting, paragraphs: ['My experience'] });
const initialJob = (existing = true) =>
  jobSchema.parse({
    id: 'job-1',
    title: 'Driver',
    advert: 'A detailed job advert. '.repeat(10),
    createdAt: '',
    updatedAt: '',
    ...(existing ? { letter: letter('Original greeting') } : {}),
  });
const snapshot = () => store.getTab(hooks.context.tabId!)!.features[fullKey]!;
function unmount() {
  hooks.slots.forEach((slot) => slot.cleanup?.());
  hooks.slots = [];
  hooks.fields.clear();
}
function commit(job: Job) {
  hooks.index = 0;
  hooks.fields.clear();
  const html = renderToStaticMarkup(<JobTools job={job} onJobChange={() => {}} />);
  hooks.layout.splice(0).forEach((effect) => effect());
  hooks.effects.splice(0).forEach((effect) => effect());
  return html;
}
function settle(job: Job) {
  commit(job);
  return commit(job); // Expose state written during the previous commit's passive effects.
}
function editGreeting(value: string) {
  const field = hooks.fields.get('Greeting');
  expect(field).toBeDefined();
  field!.change({ target: { value } });
}

beforeEach(async () => {
  store = await WorkspaceStore.open('alice', new MemoryWorkspacePersistence(), null, '/jobs/job-1');
  hooks.context = {
    store,
    tabId: store.active().id,
    ownerUid: 'alice',
    scopeKey: 'origin',
    routeKey: '/jobs/job-1',
    enabled: true,
    loading: false,
  };
  hooks.layout = [];
  hooks.effects = [];
  vi.stubGlobal('window', { location: { origin: 'https://test.invalid' } });
});
afterEach(() => {
  unmount();
  store.invalidate({ preserve: false });
  vi.unstubAllGlobals();
});

describe.each([false, true])('kit canonical letter with workspace enabled=%s', (enabled) => {
  beforeEach(() => {
    if (!enabled) hooks.context = { ...hooks.context, store: null, tabId: null, enabled: false };
  });
  it.each([false, true])('populates an untouched editor (existing letter=%s)', (existing) => {
    const original = initialJob(existing);
    settle(original);
    const next = { ...original, letter: letter('Kit greeting') };
    expect(settle(next)).toContain('data-testid="letter-editor"');
    expect(hooks.fields.get('Greeting')?.value).toBe('Kit greeting');
    if (enabled)
      expect(snapshot()).toMatchObject({
        value: next.letter,
        baseline: { value: next.letter },
        dirty: false,
      });
  });
  it('preserves newer personal input when the kit updates the canonical letter', () => {
    const original = initialJob();
    settle(original);
    editGreeting('My newer greeting');
    settle(original);
    settle({ ...original, letter: letter('Kit greeting') });
    expect(hooks.fields.get('Greeting')?.value).toBe('My newer greeting');
    if (enabled)
      expect(snapshot()).toMatchObject({
        value: { greeting: 'My newer greeting' },
        baseline: { value: original.letter },
        dirty: true,
      });
  });
});

describe('kit canonical letter after a workspace remount', () => {
  it.each([false, true])('uses the persisted baseline when personal edits exist=%s', (edited) => {
    const original = initialJob();
    settle(original);
    if (edited) editGreeting('My newer greeting');
    unmount();
    // The kit finishes while this editor is unmounted; props already contain its new letter.
    const next = { ...original, letter: letter('Kit greeting') };
    settle(next);
    expect(hooks.fields.get('Greeting')?.value).toBe(edited ? 'My newer greeting' : 'Kit greeting');
    expect(snapshot()).toMatchObject({
      dirty: edited,
      baseline: { value: edited ? original.letter : next.letter },
    });
    if (!edited) {
      editGreeting('Subsequent edit');
      expect(snapshot().dirty).toBe(true);
      settle(next);
      editGreeting('Kit greeting');
      expect(snapshot().dirty).toBe(false);
    }
  });
});
