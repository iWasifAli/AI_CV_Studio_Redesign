import { createElement, type Dispatch, type SetStateAction } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceStore } from './store';
import { MemoryWorkspacePersistence } from './storage';
import { useWorkspaceState, useWorkspaceClean } from './context';
import { useWorkspaceAcknowledge } from './use-acknowledge';

const mock = vi.hoisted(() => ({
  context: {} as { store: WorkspaceStore | null; tabId: string | null; routeKey: string },
  deferFallback: false,
  pending: [] as SetStateAction<unknown>[],
}));
// Exercise real state/clean hook closures with a controlled workspace and synchronous snapshot.
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  return {
    ...react,
    useContext: () => mock.context,
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
    useState: (initial: unknown) => {
      const [value, setValue] = react.useState(initial);
      return [
        value,
        mock.deferFallback
          ? (action: SetStateAction<unknown>) => {
              mock.pending.push(action);
            }
          : setValue,
      ];
    },
  };
});
vi.mock('@/features/account/account-context', () => ({ useAccount: () => ({}) }));
vi.mock('@/i18n/client', () => ({ useT: () => (s: string) => s }));
vi.mock('./link-menu', () => ({ WorkspaceLinkMenu: () => null }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({}),
  usePathname: () => '/portfolio',
  useSearchParams: () => new URLSearchParams(),
}));

const stores: WorkspaceStore[] = [];
afterEach(() => {
  stores.splice(0).forEach((store) => store.invalidate({ preserve: false }));
  mock.deferFallback = false;
  mock.pending = [];
});
async function open(
  persistence = new MemoryWorkspacePersistence(),
  previous: string | null = null,
) {
  const store = await WorkspaceStore.open('u', persistence, previous, '/portfolio');
  stores.push(store);
  return store;
}
function mount<T>(store: WorkspaceStore | null, initial: T, dirty = true, key = 'name') {
  mock.context = { store, tabId: store?.active().id ?? null, routeKey: '/portfolio' };
  let set!: Dispatch<SetStateAction<T>>;
  let clean!: () => void;
  let acknowledge!: (value: T) => void;
  function Capture() {
    [, set] = useWorkspaceState(key, initial, { dirty });
    clean = useWorkspaceClean();
    acknowledge = useWorkspaceAcknowledge<T>(key);
    return null;
  }
  renderToString(createElement(Capture));
  return { set, clean, acknowledge };
}
const name = (store: WorkspaceStore) => store.active().features['/portfolio:name']!;

describe('meaningful field baselines', () => {
  it('keeps A dirty after B has been explicitly saved', async () => {
    const store = await open();
    const { set } = mount(store, 'A');
    set('B');
    mount(store, 'A').clean();
    expect(name(store).dirty).toBe(false);
    set('A');
    expect(name(store).dirty).toBe(true);
    set('B');
    expect(name(store).dirty).toBe(false);
  });

  it('cleans a draft reverted to its initial acknowledged value before any save', async () => {
    const store = await open();
    const { set } = mount(store, { name: 'A' });
    set({ name: 'B' });
    expect(name(store).dirty).toBe(true);
    set({ name: 'A' });
    expect(name(store).dirty).toBe(false);
  });

  it('acknowledges submitted B while keeping later C dirty, then cleans only a return to B', async () => {
    const store = await open();
    const { set } = mount(store, 'A');
    set('B');
    const submitted = mount(store, 'A').clean;
    set('C');
    submitted();
    expect(name(store).value).toBe('C');
    expect(name(store).dirty).toBe(true);
    set('A');
    expect(name(store).dirty).toBe(true);
    set('B');
    expect(name(store).dirty).toBe(false);
  });

  it('retains the acknowledged baseline across durable restore and a new hook mount', async () => {
    const persistence = new MemoryWorkspacePersistence();
    const original = await open(persistence);
    const { set } = mount(original, 'A');
    set('B');
    mount(original, 'A').clean();
    set('C');
    await original.flush();
    const restored = await open(persistence, original.getSnapshot().session.instanceId);
    const again = mount(restored, 'A');
    expect(name(restored).value).toBe('C');
    again.set('A');
    expect(name(restored).dirty).toBe(true);
    again.set('B');
    expect(name(restored).dirty).toBe(false);
  });

  it('uses a legacy clean restored value as its baseline rather than a stale hook default', async () => {
    const store = await open();
    store.writeFeature(store.active().id, '/portfolio:name', 'B');
    const { set } = mount(store, 'A');
    set('A');
    expect(name(store).dirty).toBe(true);
    set('B');
    expect(name(store).dirty).toBe(false);
  });

  it('uses the initial default for a legacy dirty snapshot until a save is acknowledged', async () => {
    const store = await open();
    store.writeFeature(store.active().id, '/portfolio:name', 'B', true);
    const { set } = mount(store, 'A');
    set('C');
    expect(name(store).dirty).toBe(true);
    set('A');
    expect(name(store).dirty).toBe(false);
  });

  it('distinguishes separate Blobs without treating their empty JSON objects as equal', async () => {
    const store = await open();
    const initial = new Blob(['A']);
    const saved = new Blob(['B']);
    const { set } = mount(store, initial);
    set(saved);
    mount(store, initial).clean();
    set(initial);
    expect(name(store).dirty).toBe(true);
    set(new Blob(['B']));
    expect(name(store).dirty).toBe(true);
    set(saved);
    expect(name(store).dirty).toBe(false);
  });

  it('supports undefined as an acknowledged value', async () => {
    const store = await open();
    const { set } = mount<string | undefined>(store, 'A');
    set(undefined);
    mount(store, 'A').clean();
    set('A');
    expect(name(store).dirty).toBe(true);
    set(undefined);
    expect(name(store).dirty).toBe(false);
  });

  it('retains history without baseline metadata for a hook with dirty disabled', async () => {
    const persistence = new MemoryWorkspacePersistence();
    const store = await open(persistence);
    const { set } = mount(store, { history: ['A'] }, false, 'editor.history');
    set({ history: ['A', 'B'] });
    mount(store, { history: ['A'] }, false, 'editor.history').clean();
    await store.flush();
    const restored = await open(persistence, store.getSnapshot().session.instanceId);
    expect(restored.active().features['/portfolio:editor.history']).toEqual({
      version: 1,
      value: { history: ['A', 'B'] },
      dirty: false,
      updatedAt: expect.any(Number),
    });
  });
});

it('keeps an acknowledged File clean when decoding restored separate File references', async () => {
  const persistence = new MemoryWorkspacePersistence();
  const store = await open(persistence);
  const { set } = mount<File | null>(store, null);
  set(new File(['saved'], 'cv.pdf'));
  mount<File | null>(store, null).clean();
  const session = structuredClone(store.getSnapshot().session);
  const feature = session.tabs[0]!.features['/portfolio:name']!;
  // IndexedDB decoding constructs a File for each encoded occurrence of the same file.
  feature.value = new File(['saved'], 'cv.pdf');
  feature.baseline = { value: new File(['saved'], 'cv.pdf') };
  await persistence.save(session);
  const restored = await open(persistence, session.instanceId);
  mount<File | null>(restored, null).set(name(restored).value as File);
  expect(name(restored).dirty).toBe(false);
});

it('evaluates fallback updates immediately once even when React defers and replays state updates', () => {
  mock.deferFallback = true;
  const seen: number[] = [];
  const { set } = mount<number>(null, 1);
  set(3);
  set((current) => {
    seen.push(current);
    return current + 1;
  });
  set((current) => {
    seen.push(current);
    return current;
  });
  expect(seen).toEqual([3, 4]);

  let rendered: unknown = 1;
  for (const action of mock.pending) {
    if (typeof action === 'function') {
      const next = action(rendered);
      expect(action(rendered)).toBe(next);
      rendered = next;
    } else rendered = action;
  }
  expect(rendered).toBe(4);
  expect(seen).toEqual([3, 4]);
});

it('acknowledges only the saved field after navigating to another tab', async () => {
  const store = await open();
  const originalId = store.active().id;
  const field = mount(store, 'original');
  field.set('submitted');
  const otherField = mount(store, 'other original', true, 'other');
  otherField.set('other unsaved');
  field.set('newer edit');
  const otherTab = store.add('/studio');
  field.acknowledge('submitted');
  const original = store.getTab(originalId)!;
  expect(original.features['/portfolio:name']?.value).toBe('newer edit');
  expect(original.features['/portfolio:name']?.dirty).toBe(true);
  expect(original.features['/portfolio:name']?.baseline?.value).toBe('submitted');
  expect(original.features['/portfolio:other']?.dirty).toBe(true);
  expect(otherTab.features).toEqual({});
  field.set('submitted');
  expect(store.getTab(originalId)!.features['/portfolio:name']?.dirty).toBe(false);
});

it('does not acknowledge a save after the originating account lifetime has ended', async () => {
  const store = await open();
  const field = mount(store, 'original');
  field.set('submitted');
  store.invalidate({ preserve: false });
  field.acknowledge('submitted');
  expect(name(store).dirty).toBe(true);
});
