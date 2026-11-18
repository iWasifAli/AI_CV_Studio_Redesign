import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { BrowserDocumentRepository, MemoryStore } from '@/modules/storage/repository';
import { driver } from '@/modules/resume/fixtures';
import { job as jobSchema } from '@/modules/jobs/schema';
const state = vi.hoisted(() => ({
  repo: null as unknown as BrowserDocumentRepository,
  values: new Map<string, unknown>(),
  effects: [] as (() => unknown)[],
  subscribed: false,
  version: 0,
  view: null as (() => ReactNode) | null,
  html: '',
  changed: false,
  selectChange: null as ((event: { target: { value: string } }) => void) | null,
}));
// Read the real select handler from the form children without replacing the selector.
vi.mock('@/components/ui/card', async () => {
  const { Children, isValidElement } = await import('react');
  return {
    Card: ({ children }: { children: ReactNode }) => {
      const scan = (nodes: ReactNode) =>
        Children.forEach(nodes, (node) => {
          if (!isValidElement<{ children?: ReactNode; onChange?: typeof state.selectChange }>(node))
            return;
          if (node.type === 'select') state.selectChange = node.props.onChange ?? null;
          if (node.props.children) scan(node.props.children);
        });
      scan(children);
      return <div>{children}</div>;
    },
  };
});
// Snapshot setters retain a selection across renders, as the workspace store does.
vi.mock('@/features/workspace/context', () => ({
  useWorkspaceState: (key: string, initial: unknown) => {
    if (!state.values.has(key))
      state.values.set(key, typeof initial === 'function' ? initial() : initial);
    return [
      state.values.get(key),
      (next: unknown) => {
        const value = typeof next === 'function' ? next(state.values.get(key)) : next;
        if (!Object.is(value, state.values.get(key))) {
          state.values.set(key, value);
          state.changed = true;
        }
      },
    ];
  },
  useWorkspaceTask: () => (_key: string, work: (signal: AbortSignal) => Promise<unknown>) =>
    work(new AbortController().signal),
  useWorkspace: () => ({ ownerUid: 'alice', store: null, tabId: null }),
  useWorkspaceScope: () => 'alice/tab/route',
  useWorkspaceClean: () => () => {},
  useWorkspaceDownload: () => () => {},
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (effect: () => unknown) => {
    state.effects.push(effect);
  },
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock('@/features/account/account-context', () => ({
  useAccount: () => ({ status: 'signedIn', user: { uid: 'alice' } }),
  useRepositoryVersion: () => {
    state.subscribed = true;
    return state.version;
  },
}));
vi.mock('@/modules/storage/repository', async (original) => ({
  ...(await original<typeof import('@/modules/storage/repository')>()),
  getRepository: () => state.repo,
}));
vi.mock('@/features/account/entitlements', () => ({
  useEntitlements: () => ({ ent: null, refresh: () => {} }),
}));
vi.mock('@/features/workspace/navigation', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  useWorkspaceRouter: () => ({ push: () => {}, replace: () => {} }),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/i18n/client', () => ({ useT: () => (s: string) => s, useLang: () => 'en' }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: () => {} }) }));
vi.mock('./company-brief', () => ({ CompanyBrief: () => null }));
vi.mock('./kit-section', () => ({ KitSection: () => null }));
vi.mock('./mock-interview', () => ({ MockInterview: () => null }));
import { JobTools } from './job-tools';
import { LinkedinScreen } from '@/features/linkedin/linkedin-screen';
import { LinkedinReview } from '@/features/linkedin/linkedin-review';
function render() {
  for (let i = 0; i < 8; i++) {
    state.effects = [];
    state.changed = false;
    state.html = renderToStaticMarkup(state.view!());
    state.effects.forEach((effect) => effect());
    if (!state.changed) return;
  }
  throw new Error('Source did not settle');
}
beforeEach(() => {
  state.repo = new BrowserDocumentRepository(new MemoryStore());
  state.values.clear();
  state.effects = [];
  state.subscribed = false;
  state.version = 0;
  vi.stubGlobal('window', {
    location: { href: 'http://localhost/linkedin', origin: 'http://localhost' },
  });
  // The version hook's subscription contract: writes re-render only subscribed consumers.
  state.repo.subscribe(() => {
    state.version++;
    if (state.subscribed) render();
  });
});
afterEach(() => vi.unstubAllGlobals());
const job = jobSchema.parse({
  id: 'j',
  title: 'Driver',
  advert: 'A useful advert. '.repeat(10),
  createdAt: 'now',
  updatedAt: 'now',
});
it.each([
  ['job tools', 'jobs.JobTools.sourceId', () => <JobTools job={job} onJobChange={() => {}} />],
  ['LinkedIn writer', 'linkedin.LinkedinWriter.docId', () => <LinkedinScreen />],
  ['LinkedIn review', 'linkedin.LinkedinReview.docId', () => <LinkedinReview />],
] as const)(
  '%s picks an arriving CV and preserves the selection on later syncs',
  (_name, key, view) => {
    state.view = view;
    render();
    expect(state.values.get(key)).toBe('');
    state.repo.save({ ...driver, id: 'arrived', title: 'Arrived CV' });
    expect(state.values.get(key)).toBe('arrived');
    expect(state.html).toContain('Arrived CV');
    // Arrival of a preferred career profile must not replace a source already selected.
    state.repo.save({ ...driver, id: 'profile', role: 'profile', title: 'Career profile' });
    expect(state.values.get(key)).toBe('arrived');
    state.values.set(key, 'profile');
    render();
    state.repo.save({ ...driver, id: 'another', title: 'Another CV' });
    expect(state.values.get(key)).toBe('profile');
  },
);
it('does not replace an explicit LinkedIn Don’t compare choice on CV arrival', () => {
  state.values.set('linkedin.LinkedinReview.docId', '');
  state.view = () => <LinkedinReview />;
  render();
  state.repo.save({ ...driver, id: 'first', title: 'First CV' });
  expect(state.selectChange).toBeTypeOf('function');
  state.selectChange!({ target: { value: '' } });
  render();
  state.repo.save({ ...driver, id: 'arrived', title: 'Arrived CV' });
  expect(state.html).toContain('Arrived CV');
  expect(state.values.get('linkedin.LinkedinReview.docId')).toBe('');
});
it('keeps a requested LinkedIn CV ID while unrelated documents arrive first', () => {
  state.values.set('linkedin.LinkedinWriter.docId', 'requested');
  state.view = () => <LinkedinScreen />;
  render();
  state.repo.save({ ...driver, id: 'other', title: 'Other CV' });
  expect(state.values.get('linkedin.LinkedinWriter.docId')).toBe('requested');
  state.repo.save({ ...driver, id: 'requested', title: 'Requested CV' });
  expect(state.html).toContain('Requested CV');
  expect(state.values.get('linkedin.LinkedinWriter.docId')).toBe('requested');
});
