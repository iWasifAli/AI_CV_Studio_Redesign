'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Plus,
  RotateCcw,
  X,
  CopyPlus,
  Download,
} from 'lucide-react';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/cn';
import { useWorkspace } from './context';
import { routeInfo, workspaceHref } from './routes';
import type { WorkspaceTab } from './model';
import { getRepository } from '@/modules/storage/repository';
import { downloadWorkspaceRecovery } from './recovery';
import { saveBlob } from '@/lib/save-blob';

const noop = () => () => {};
const empty = () => null;
export function WorkspaceTabBar() {
  const { store } = useWorkspace();
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? noop,
    store?.getSnapshot ?? empty,
    empty,
  );
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!store || !bar.current) return;
    const measure = () =>
      document.documentElement.style.setProperty(
        '--workspace-tab-height',
        `${bar.current?.offsetHeight ?? 0}px`,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(bar.current);
    measure();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--workspace-tab-height');
    };
  }, [store, pathname]);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const activeId = snapshot?.session.activeTabId;
  const tabCount = snapshot?.session.tabs.length;
  useLayoutEffect(() => {
    const selected = activeId ? refs.current.get(activeId) : null;
    const list = selected?.parentElement;
    if (!selected || !list) return;
    const reveal = () => {
      const tabBounds = selected.getBoundingClientRect();
      const listBounds = list.getBoundingClientRect();
      // Reveal the active tab horizontally without moving the page or its restored scroll position.
      if (tabBounds.left < listBounds.left) list.scrollLeft += tabBounds.left - listBounds.left;
      else if (tabBounds.right > listBounds.right)
        list.scrollLeft += tabBounds.right - listBounds.right;
    };
    const observer = new ResizeObserver(reveal);
    observer.observe(list);
    observer.observe(selected);
    reveal();
    return () => observer.disconnect();
  }, [activeId, tabCount, pathname]);
  const [recoveryProblem, setRecoveryProblem] = useState('');
  const [history, setHistory] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  if (!store || !snapshot || !routeInfo(pathname)) return null;
  const { session } = snapshot;
  const go = async (tab: WorkspaceTab) => {
    await store.flush().catch(() => {});
    if (
      store.isLive() &&
      store.getSnapshot().session.activeTabId === tab.id &&
      store.getTab(tab.id)?.href === tab.href
    )
      router.push(workspaceHref(tab.href, tab.id), { scroll: false });
  };
  const select = (tab: WorkspaceTab) => {
    store.activate(tab.id);
    void go(tab);
  };
  const close = (id: string) => {
    const wasActive = session.activeTabId === id;
    store.close(id);
    if (wasActive) {
      void go(store.active());
      requestAnimationFrame(() => refs.current.get(store.active().id)?.focus());
    }
  };
  const keyDown = (event: KeyboardEvent, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % session.tabs.length;
    else if (event.key === 'ArrowLeft')
      next = (index - 1 + session.tabs.length) % session.tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = session.tabs.length - 1;
    else if (event.key === 'Delete') {
      event.preventDefault();
      close(session.tabs[index]!.id);
      return;
    } else return;
    event.preventDefault();
    refs.current.get(session.tabs[next]!.id)?.focus();
  };
  const active = store.active();
  const downloads = Object.entries(active.features).filter(
    ([key, value]) =>
      key.startsWith('$download:') && value.value && typeof value.value === 'object',
  );
  const tasks = Object.values(active.tasks);
  return (
    <div
      ref={bar}
      className="border-line bg-paper sticky top-[var(--workspace-top,0px)] z-20 min-w-0 border-b"
      data-testid="workspace-tabs"
    >
      <span id="workspace-keyboard-help" className="sr-only">
        {t('Press Delete to close a focused workspace.')}
      </span>
      <div className="flex min-w-0 items-center gap-1 px-2">
        <div
          role="tablist"
          aria-label={t('Workspaces')}
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto overscroll-x-contain py-1"
        >
          {session.tabs.map((tab, index) => {
            const selected = tab.id === session.activeTabId;
            const running = Object.values(tab.tasks).some((task) => task.status === 'running');
            const error = Object.values(tab.tasks).some(
              (task) => task.status === 'error' || task.status === 'interrupted',
            );
            const completed = Object.values(tab.tasks).some((task) => task.status === 'complete');
            return (
              <button
                type="button"
                key={tab.id}
                ref={(el) => {
                  if (el) refs.current.set(tab.id, el);
                  else refs.current.delete(tab.id);
                }}
                role="tab"
                aria-keyshortcuts="Delete"
                aria-describedby="workspace-keyboard-help"
                id={`workspace-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={selected ? `workspace-panel-${tab.id}` : undefined}
                tabIndex={selected ? 0 : -1}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    select(tab);
                  } else keyDown(e, index);
                }}
                onClick={() => select(tab)}
                title={tab.title}
                className={cn(
                  'flex shrink-0 cursor-pointer items-center rounded-md border',
                  selected
                    ? 'border-primary/30 bg-primary-soft'
                    : 'hover:bg-sunken border-transparent',
                )}
              >
                <span className="text-ink flex min-h-11 max-w-52 min-w-24 items-center gap-2 px-3 text-sm font-semibold">
                  {running ? (
                    <LoaderCircle
                      size={15}
                      className="motion-safe:animate-spin"
                      aria-label={t('Working')}
                    />
                  ) : error ? (
                    <CircleAlert size={15} aria-label={t('Needs attention')} />
                  ) : completed ? (
                    <CircleCheck size={15} aria-label={t('Complete')} />
                  ) : null}
                  <span className="truncate">{t(tab.title)}</span>
                </span>
                <span
                  aria-hidden="true"
                  title={t('Close workspace')}
                  onClick={(event) => {
                    event.stopPropagation();
                    close(tab.id);
                  }}
                  className="text-ink-muted hover:text-ink flex size-11 items-center justify-center rounded-md"
                >
                  <X size={15} />
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          title={t('New workspace')}
          aria-label={t('New workspace')}
          onClick={() => {
            void go(store.add());
          }}
          className="hover:bg-sunken flex size-11 shrink-0 items-center justify-center rounded-md"
        >
          <Plus size={19} />
        </button>
        <button
          type="button"
          title={t('Open in app tab')}
          aria-label={t('Open in app tab')}
          onClick={() => {
            void go(store.add(active.href));
          }}
          className="hover:bg-sunken hidden size-11 shrink-0 items-center justify-center rounded-md sm:flex"
        >
          <CopyPlus size={18} />
        </button>
        <button
          type="button"
          aria-label={t('Close selected workspace')}
          title={t('Close selected workspace')}
          onClick={() => close(active.id)}
          className="hover:bg-sunken flex size-11 shrink-0 items-center justify-center rounded-md"
        >
          <X size={17} />
        </button>
        <button
          type="button"
          title={t('Recently closed workspaces')}
          aria-label={t('Recently closed workspaces')}
          aria-expanded={history}
          onClick={() => setHistory(!history)}
          className="hover:bg-sunken flex size-11 shrink-0 items-center justify-center rounded-md"
        >
          <RotateCcw size={18} />
        </button>
        {(tasks.length > 0 || downloads.length > 0) && (
          <button
            type="button"
            aria-label={t('Workspace activity')}
            aria-expanded={showStatus}
            onClick={() => setShowStatus(!showStatus)}
            className="hover:bg-sunken flex size-11 items-center justify-center rounded-md"
          >
            <CircleAlert size={18} />
          </button>
        )}
      </div>
      {snapshot.problem && (
        <div role="alert" className="bg-warning-soft px-4 py-2 text-sm">
          {t(snapshot.problem)}{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              void store.flush().catch(() => {});
            }}
          >
            {t('Retry')}
          </button>{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              void store.persistence
                .list(session.ownerUid)
                .catch(() => [])
                .then((sessions) => {
                  const all = sessions.filter((entry) => entry.instanceId !== session.instanceId);
                  return downloadWorkspaceRecovery([...all, session], getRepository().exportAll());
                })
                .catch(() =>
                  setRecoveryProblem(
                    'The recovery download failed. Your local work has been kept.',
                  ),
                );
            }}
          >
            {t('Download recovery copy')}
          </button>
          {recoveryProblem && <p>{t(recoveryProblem)}</p>}
        </div>
      )}
      {history && (
        <div className="border-line bg-paper absolute top-full right-2 w-72 max-w-[calc(100vw-1rem)] rounded-md border p-2 shadow-lg">
          {session.closedTabs.length ? (
            session.closedTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="hover:bg-sunken block min-h-11 w-full truncate rounded px-3 text-left text-sm"
                onClick={() => {
                  const reopened = store.reopen(tab.id);
                  setHistory(false);
                  if (reopened) void go(reopened);
                }}
              >
                {t('Reopen')} {tab.title}
              </button>
            ))
          ) : (
            <p className="text-ink-muted p-3 text-sm">{t('No recently closed workspaces')}</p>
          )}
        </div>
      )}
      {showStatus && (
        <div className="border-line border-t px-4 py-3 text-sm" role="status">
          {tasks.map((task) => (
            <p key={task.id}>
              {(task.message && t(task.message)) ||
                t(
                  task.status === 'running'
                    ? 'Working in this workspace…'
                    : task.status === 'complete'
                      ? 'Work completed.'
                      : 'Check this workspace before retrying.',
                )}
            </p>
          ))}
          {downloads.map(([key, entry]) => {
            const file = entry.value as { blob: Blob; filename: string };
            return file.blob instanceof Blob ? (
              <button
                key={key}
                type="button"
                className="text-primary inline-flex min-h-11 items-center gap-2 underline"
                onClick={() => saveBlob(file.blob, file.filename)}
              >
                <Download size={16} />
                {file.filename}
              </button>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
