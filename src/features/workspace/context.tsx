'use client';

import {
  createContext,
  Fragment,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@/i18n/client';
import { useAccount } from '@/features/account/account-context';
import { replaceWorkspaceLocation } from './history';
import { WorkspaceLinkMenu } from './link-menu';
import { WorkspaceStore } from './store';
import { IndexedDbWorkspacePersistence } from './storage';
import { browserExitTransport, WorkspaceExitCoordinator } from './lifecycle';
import { downloadWorkspaceRecovery } from './recovery';
import { getRepository } from '@/modules/storage/repository';
import { routeInfo, routeScope, workspaceHref, WORKSPACE_PARAM } from './routes';

export type WorkspaceContextValue = {
  store: WorkspaceStore | null;
  tabId: string | null;
  ownerUid: string | null;
  scopeKey: string | null;
  routeKey: string;
  enabled: boolean;
  loading: boolean;
};
const EMPTY: WorkspaceContextValue = {
  store: null,
  tabId: null,
  ownerUid: null,
  scopeKey: null,
  routeKey: '',
  enabled: false,
  loading: false,
};
const Context = createContext<WorkspaceContextValue>(EMPTY);
const subscribeNone = () => () => {};
const nullSnapshot = () => null;
const hrefNow = () => window.location.pathname + window.location.search + window.location.hash;
const persistence = new IndexedDbWorkspacePersistence();

function RouteObserver({ onChange }: { onChange: (href: string) => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  useLayoutEffect(() => {
    const notify = () => onChange(hrefNow());
    notify();
    window.addEventListener('hashchange', notify);
    window.addEventListener('popstate', notify);
    return () => {
      window.removeEventListener('hashchange', notify);
      window.removeEventListener('popstate', notify);
    };
  }, [pathname, params, onChange]);
  return null;
}

export function WorkspaceProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const account = useAccount();
  const router = useRouter();
  const pathname = usePathname();
  const [store, setStore] = useState<WorkspaceStore | null>(null);
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? subscribeNone,
    store?.getSnapshot ?? nullSnapshot,
    nullSnapshot,
  );
  const [routeHref, setRouteHref] = useState(pathname);
  const uid =
    enabled && (account.status === 'signedIn' || account.status === 'offline')
      ? account.user!.uid
      : null;

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    let instance: WorkspaceStore | null = null;
    let previous: string | null = null;
    try {
      previous = sessionStorage.getItem(`cvstudio:workspace-window:${uid}`);
    } catch {}
    void WorkspaceStore.open(uid, persistence, previous, hrefNow()).then((next) => {
      if (!alive) {
        next.invalidate();
        return;
      }
      instance = next;
      try {
        sessionStorage.setItem(
          `cvstudio:workspace-window:${uid}`,
          next.getSnapshot().session.instanceId,
        );
      } catch {}
      // A normal reload replaces its durable snapshot; duplicated or sleeping windows keep theirs.
      if (previous && next.getSnapshot().persistence === 'saved') {
        try {
          if (!localStorage.getItem(`cvstudio:workspace-peer:${uid}:${previous}`))
            void persistence.removeInstance(uid, previous).catch(() => {});
        } catch {}
      }
      setStore(next);
      const active = next.active();
      if (routeInfo(hrefNow()))
        replaceWorkspaceLocation(workspaceHref(active.href, active.id), (href) =>
          router.replace(href, { scroll: false }),
        );
    });
    return () => {
      alive = false;
      instance?.invalidate();
    };
  }, [uid, router]);

  const onRoute = useCallback(
    (href: string) => {
      setRouteHref(href);
      const current = store;
      if (
        !current ||
        !current.isLive() ||
        current.getSnapshot().session.ownerUid !== uid ||
        !routeInfo(href)
      )
        return;
      const url = new URL(href, window.location.origin);
      const requested = url.searchParams.get(WORKSPACE_PARAM);
      const tab = current.visit(href, requested);
      const resolved = workspaceHref(tab.href, tab.id);
      if (resolved !== href)
        replaceWorkspaceLocation(resolved, (next) => router.replace(next, { scroll: false }));
    },
    [uid, router, store],
  );

  useEffect(() => {
    if (!store || store.getSnapshot().session.ownerUid !== uid) return;
    const hide = () => {
      void store.flush().catch(() => {});
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      hide();
      if (store.getSnapshot().persistence !== 'saved') event.preventDefault();
    };
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [store, uid]);

  const { registerExit, flushForExit, endLocalSession } = account;
  useEffect(() => {
    if (!store || !uid || store.getSnapshot().session.ownerUid !== uid || !store.isLive()) return;
    const exit = new WorkspaceExitCoordinator(
      store,
      browserExitTransport(
        uid,
        store.getSnapshot().session.instanceId,
        () => store.getSnapshot().persistence === 'saved',
      ),
      () => flushForExit(uid),
      () => endLocalSession(uid),
    );
    const unregister = registerExit({
      prepare: () => exit.prepare(),
      cancel: () => exit.cancel(),
      commit: () => exit.commit(),
      exportRecovery: async () =>
        downloadWorkspaceRecovery(await exit.recoverySessions(), getRepository().exportAll()),
    });
    return () => {
      unregister();
      exit.dispose();
    };
  }, [store, uid, registerExit, flushForExit, endLocalSession]);

  const validStore = uid && store?.isLive() && snapshot?.session.ownerUid === uid ? store : null;
  const activeId = validStore?.active().id;
  const routeKey = routeScope(routeHref || '/studio');
  const value = useMemo<WorkspaceContextValue>(
    () => ({
      store: validStore,
      tabId: activeId ?? null,
      ownerUid: uid,
      scopeKey:
        validStore && activeId
          ? `${uid}/${validStore.getSnapshot().session.instanceId}/${activeId}/${routeKey}`
          : null,
      routeKey,
      enabled,
      loading: enabled && (account.status === 'loading' || (!!uid && !validStore)),
    }),
    [validStore, activeId, uid, routeKey, enabled, account.status],
  );
  return (
    <Context.Provider value={value}>
      {uid && (
        <Suspense fallback={null}>
          <RouteObserver onChange={onRoute} />
        </Suspense>
      )}
      {children}
      <WorkspaceLinkMenu />
    </Context.Provider>
  );
}

export const useWorkspace = () => useContext(Context);
export const useWorkspaceScope = () => useWorkspace().scopeKey;

/** Snapshot setters capture their origin and remain usable by background tasks after unmount. */
export function useWorkspaceState<T>(
  key: string,
  initial: T | (() => T),
  options?: { dirty?: boolean },
): [T, Dispatch<SetStateAction<T>>] {
  const { store, tabId, routeKey } = useWorkspace();
  const [fallback, setFallback] = useState(initial);
  const fallbackRef = useRef(fallback);
  const initialRef = useRef(fallback);
  const fullKey = `${routeKey}:${key}`;
  const get = useCallback(
    () =>
      store && tabId && store.hasFeature(tabId, fullKey)
        ? (store.readFeature(tabId, fullKey) as T)
        : initialRef.current,
    [store, tabId, fullKey],
  );
  const stored = useSyncExternalStore(
    store?.subscribe ?? subscribeNone,
    get,
    () => initialRef.current,
  );
  const dirty = options?.dirty === true;
  useEffect(() => {
    if (!store || !tabId) return;
    const feature = store.getTab(tabId)?.features[fullKey];
    if (!feature || (dirty && !feature.baseline)) {
      store.writeFeature(
        tabId,
        fullKey,
        feature ? feature.value : initialRef.current,
        feature?.dirty ?? false,
        dirty ? { value: initialRef.current } : undefined,
      );
    }
  }, [store, tabId, fullKey, dirty]);
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      if (!store || !tabId) {
        // Match the store's immediate updater semantics even if React defers or replays renders.
        const next =
          typeof action === 'function' ? (action as (value: T) => T)(fallbackRef.current) : action;
        fallbackRef.current = next;
        setFallback(() => next);
        return;
      }
      if (!store.isLive()) return;
      const current = store.hasFeature(tabId, fullKey)
        ? (store.readFeature(tabId, fullKey) as T)
        : initialRef.current;
      const next = typeof action === 'function' ? (action as (value: T) => T)(current) : action;
      store.writeFeature(
        tabId,
        fullKey,
        next,
        dirty,
        dirty ? { value: initialRef.current } : undefined,
      );
    },
    [store, tabId, fullKey, dirty],
  );
  return [store && tabId ? stored : fallback, set];
}

export function useWorkspaceTask() {
  const { store, tabId, routeKey } = useWorkspace();
  return useCallback(
    <T,>(key: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
      if (!store || !tabId) return work(new AbortController().signal);
      return store.runTask(tabId, `${routeKey}:${key}`, work);
    },
    [store, tabId, routeKey],
  );
}

export function useWorkspaceClean() {
  const { store, tabId, routeKey } = useWorkspace();
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? subscribeNone,
    store?.getSnapshot ?? nullSnapshot,
    nullSnapshot,
  );
  const expected = snapshot && tabId ? store?.getTab(tabId)?.features : undefined;
  return useCallback(() => {
    if (store && tabId) store.markClean(tabId, `${routeKey}:`, expected);
  }, [store, tabId, routeKey, expected]);
}

/** Routed features must never mount under the previously selected tab while Next is navigating. */
export function WorkspaceBoundary({ children }: { children: ReactNode }) {
  const t = useT();
  const account = useAccount();
  const context = useWorkspace();
  const { store, tabId, loading } = context;
  const pathname = usePathname();
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? subscribeNone,
    store?.getSnapshot ?? nullSnapshot,
    nullSnapshot,
  );
  const supported = !!routeInfo(pathname);
  const tab = tabId ? store?.getTab(tabId) : null;
  const actual = typeof window === 'undefined' ? pathname : hrefNow();
  const actualRoute = routeInfo(actual);
  const matches =
    !store ||
    !supported ||
    (tab &&
      actualRoute?.href === tab.href &&
      new URL(actual, 'https://workspace.invalid').searchParams.get(WORKSPACE_PARAM) === tabId);
  if (supported && (account.status === 'loading' || loading || !matches))
    return (
      <div className="text-ink-muted flex min-h-64 items-center justify-center" role="status">
        {t(context.enabled ? 'Restoring workspace…' : 'Loading…')}
      </div>
    );
  if (!supported) return children;
  if (!store || !tabId) return <Fragment key={account.user?.uid ?? 'visitor'}>{children}</Fragment>;
  return (
    <div
      key={`${tabId}:${context.routeKey}`}
      id={`workspace-panel-${tabId}`}
      role="tabpanel"
      aria-labelledby={`workspace-tab-${tabId}`}
      aria-busy={snapshot?.frozen || undefined}
      inert={snapshot?.frozen || undefined}
    >
      <WorkspaceScroll>{children}</WorkspaceScroll>
    </div>
  );
}
function WorkspaceScroll({ children }: { children: ReactNode }) {
  const { store, tabId, routeKey } = useWorkspace();
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!store || !tabId) return;
    const positions = store.getTab(tabId)?.scroll ?? {};
    const restore = () => {
      const page = positions[`${routeKey}:window`];
      if (page) window.scrollTo(page.left, page.top);
      root.current
        ?.querySelectorAll<HTMLElement>('[data-workspace-scroll], main, [class*="overflow-y-auto"]')
        .forEach((el, index) => {
          const p = positions[`${routeKey}:pane:${el.dataset.workspaceScroll ?? index}`];
          if (p) {
            el.scrollTop = p.top;
            el.scrollLeft = p.left;
          }
        });
    };
    const frame = requestAnimationFrame(restore);
    const capture = () => {
      store.setScroll(tabId, `${routeKey}:window`, { top: window.scrollY, left: window.scrollX });
      root.current
        ?.querySelectorAll<HTMLElement>('[data-workspace-scroll], main, [class*="overflow-y-auto"]')
        .forEach((el, index) => {
          store.setScroll(tabId, `${routeKey}:pane:${el.dataset.workspaceScroll ?? index}`, {
            top: el.scrollTop,
            left: el.scrollLeft,
          });
        });
    };
    const off = store.registerFlusher(capture);
    return () => {
      cancelAnimationFrame(frame);
      capture();
      off();
    };
  }, [store, tabId, routeKey]);
  return (
    <div ref={root} className="min-w-0">
      {children}
    </div>
  );
}

/** An export finishing in the background becomes an explicit download in its tab's activity. */
export function useWorkspaceDownload() {
  const { store, tabId } = useWorkspace();
  return useCallback(
    (blob: Blob, filename: string) => {
      if (store && tabId) {
        if (!store.isLive()) return;
        store.writeFeature(tabId, `$download:${filename}`, { blob, filename });
        if (store.getSnapshot().session.activeTabId !== tabId) return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    },
    [store, tabId],
  );
}
