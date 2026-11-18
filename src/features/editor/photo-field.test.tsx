import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { driver } from '@/modules/resume/fixtures';
import type { DocumentEditor } from './use-document-editor';

const state = vi.hoisted(() => ({
  index: 0,
  slots: [] as { value?: unknown; deps?: unknown[]; cleanup?: () => void }[],
  effects: [] as (() => void)[],
  account: { status: 'signedIn', user: { uid: 'alice' } } as {
    status: string;
    user: { uid: string } | null;
  },
  store: null as { isLive: () => boolean } | null,
  live: true,
  controller: new AbortController(),
  tasks: [] as Promise<unknown>[],
  values: new Map<string, unknown>(),
  load: vi.fn(),
  save: vi.fn(),
  shrink: vi.fn(),
}));
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  const changed = (a?: unknown[], b?: unknown[]) =>
    !a || !b || a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]));
  const memo = (fn: () => unknown, deps?: unknown[]) => {
    const slot = (state.slots[state.index++] ??= {});
    if (changed(slot.deps, deps)) {
      slot.value = fn();
      slot.deps = deps;
    }
    return slot.value;
  };
  const effect = (fn: () => void | (() => void), deps?: unknown[]) => {
    const slot = (state.slots[state.index++] ??= {});
    if (changed(slot.deps, deps)) {
      state.effects.push(() => {
        slot.cleanup?.();
        slot.cleanup = fn() || undefined;
      });
      slot.deps = deps;
    }
  };
  return {
    ...react,
    useId: () => 'photo',
    useState: (initial: unknown) => {
      const slot = (state.slots[state.index++] ??= {
        value: typeof initial === 'function' ? initial() : initial,
      });
      return [
        slot.value,
        (next: unknown) => {
          slot.value = typeof next === 'function' ? next(slot.value) : next;
        },
      ];
    },
    useRef: (initial: unknown) => memo(() => ({ current: initial }), []),
    useMemo: memo,
    useEffect: effect,
    useLayoutEffect: effect,
  };
});
vi.mock('@/features/account/account-context', () => ({ useAccount: () => state.account }));
vi.mock('@/features/workspace/context', () => ({
  useWorkspace: () => ({ store: state.store, ownerUid: null }),
  useWorkspaceState: (key: string, initial: unknown) => [
    state.values.get(key) ?? initial,
    (value: unknown) => state.values.set(key, value),
  ],
  useWorkspaceTask: () => (_key: string, work: (signal: AbortSignal) => Promise<unknown>) => {
    const task = work(state.controller.signal);
    state.tasks.push(task);
    return task;
  },
}));
vi.mock('@/i18n/client', () => ({ useT: () => (value: string) => value }));
vi.mock('@/components/ui/button', () => ({ Button: 'button' }));
vi.mock('@/modules/templates/registry', () => ({ getTemplate: () => ({ photo: 'circle' }) }));
vi.mock('./photo-originals', () => ({
  loadOriginal: state.load,
  saveOriginal: state.save,
  shrinkForKeeping: state.shrink,
}));
import { PhotoField } from './photo-field';

let editor: DocumentEditor;
const bitmap = () => ({ width: 100, height: 120, close: vi.fn() });
const image = vi.fn();
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
const render = () => {
  state.index = 0;
  const tree = PhotoField({ editor });
  state.effects.splice(0).forEach((effect) => effect());
  return tree;
};
const find = (
  node: ReactNode,
  check: (props: Record<string, unknown>) => boolean,
): ReactElement<Record<string, unknown>> | undefined => {
  if (!isValidElement<Record<string, unknown>>(node)) return;
  if (check(node.props)) return node;
  for (const child of Children.toArray(node.props.children as ReactNode)) {
    const found = find(child, check);
    if (found) return found;
  }
};
const choose = (tree: ReactNode) => {
  const input = find(tree, (props) => props.type === 'file')!;
  (input.props.onChange as (event: unknown) => void)({
    target: { files: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })], value: '' },
  });
};
const done = async () => {
  await Promise.allSettled(state.tasks);
  await flush();
};
beforeEach(() => {
  state.index = 0;
  state.slots = [];
  state.effects = [];
  state.tasks = [];
  state.values.clear();
  state.account = { status: 'signedIn', user: { uid: 'alice' } };
  state.store = null;
  state.live = true;
  state.controller = new AbortController();
  state.load.mockReset().mockResolvedValue(null);
  state.save.mockReset().mockResolvedValue(undefined);
  state.shrink.mockReset().mockResolvedValue(new Blob(['original']));
  image.mockReset().mockImplementation(async () => bitmap());
  vi.stubGlobal('createImageBitmap', image);
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({ drawImage: () => {} }),
      toDataURL: () => 'data:image/jpeg;base64,cropped',
    }),
  });
  editor = {
    doc: { ...driver, basics: { ...driver.basics, photo: '' } },
    update: vi.fn(),
  } as unknown as DocumentEditor;
});
afterEach(() => {
  state.slots.forEach((slot) => slot.cleanup?.());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(['signedIn', 'offline'])(
  'uses the %s owner even with workspace tabs disabled',
  async (status) => {
    state.account.status = status;
    choose(render());
    await done();
    expect(state.save).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Blob),
      expect.any(Object),
      'alice',
      expect.any(Function),
    );
    expect(state.save.mock.calls[0]![4]()).toBe(true);
  },
);
it('loads only the actual account cache, or explicitly guest when signed out', async () => {
  editor.doc.basics.photo = 'data:image/jpeg;base64,cropped';
  state.load.mockResolvedValue({ blob: new Blob(['owner']), crop: { zoom: 1, x: 0.5, y: 0.5 } });
  render();
  await flush();
  expect(state.load.mock.calls[0]![1]).toBe('alice');
  state.account = { status: 'signedOut', user: null };
  render();
  await flush();
  expect(state.load.mock.calls[1]![1]).toBe(null);
});
it('drops a flag-off upload if the account changes during image decoding', async () => {
  let resolve!: (image: ReturnType<typeof bitmap>) => void;
  image.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  choose(render());
  state.account = { status: 'signedIn', user: { uid: 'bob' } };
  render();
  const decoded = bitmap();
  resolve(decoded);
  await done();
  expect(state.save).not.toHaveBeenCalled();
  expect(editor.update).not.toHaveBeenCalled();
  expect(decoded.close).toHaveBeenCalledOnce();
});
it('drops an upload when its captured workspace is invalidated', async () => {
  state.store = { isLive: () => state.live };
  let resolve!: (image: ReturnType<typeof bitmap>) => void;
  image.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  choose(render());
  state.live = false;
  resolve(bitmap());
  await done();
  expect(state.save).not.toHaveBeenCalled();
  expect(editor.update).not.toHaveBeenCalled();
});
it('passes an abort-aware gate to the cache and rejects the late completion', async () => {
  let resolve!: () => void;
  state.save.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  choose(render());
  await flush();
  const live = state.save.mock.calls[0]![4] as (() => boolean) | undefined;
  expect(live?.()).toBe(true);
  state.controller.abort();
  expect(live?.()).toBe(false);
  resolve();
  await done();
  expect(editor.update).not.toHaveBeenCalled();
});
it('cancels a deferred crop save on an account switch', async () => {
  vi.useFakeTimers();
  editor.doc.basics.photo = 'data:image/jpeg;base64,cropped';
  state.load.mockResolvedValue({ blob: new Blob(['alice']), crop: { zoom: 1, x: 0.5, y: 0.5 } });
  render();
  await flush();
  const slider = find(render(), (props) => props.label === 'Zoom')!;
  (slider.props.onChange as (zoom: number) => void)(2);
  state.account = { status: 'signedIn', user: { uid: 'bob' } };
  render();
  await vi.advanceTimersByTimeAsync(350);
  await flush();
  expect(state.save).not.toHaveBeenCalled();
});
