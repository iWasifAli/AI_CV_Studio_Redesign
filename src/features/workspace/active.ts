/**
 * Which workspace tab is on screen. A tiny store shared by the strip, the page shell and
 * `useDraft`. `epoch` changes only when the person switches to another tab, so the page can be
 * remounted fresh for that tab (two tabs may show the same route with different drafts).
 */
type Snapshot = { id: string | null; epoch: number };
let current: Snapshot = { id: null, epoch: 0 };
const listeners = new Set<() => void>();

export const activeTab = {
  get: (): Snapshot => current,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  /** The tab on screen. `switched` bumps the epoch (a switch), otherwise it is only recorded. */
  set(id: string | null, switched: boolean) {
    if (current.id === id && !switched) return;
    current = { id, epoch: switched ? current.epoch + 1 : current.epoch };
    listeners.forEach((l) => l());
  },
};

/** Finished background work reports here when its screen is gone (see `useGoWhenDone`). */
type Settled = (tabId: string, href: string) => void;
const settledListeners = new Set<Settled>();
export const settledWork = {
  subscribe(fn: Settled) {
    settledListeners.add(fn);
    return () => void settledListeners.delete(fn);
  },
  emit(tabId: string, href: string) {
    settledListeners.forEach((l) => l(tabId, href));
  },
};
