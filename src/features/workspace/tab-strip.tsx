'use client';

import { useT } from '@/i18n/client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { Plus, Undo2 } from 'lucide-react';
import { useAccount } from '@/features/account/account-context';
import { activeTab, settledWork } from './active';
import { clearAllDrafts, clearTabDrafts } from './drafts';
import { WorkspaceTabItem } from './tab-item';
import {
  MAX_TABS,
  activate,
  close,
  initial,
  isTabHref,
  open,
  parse,
  rename,
  reorder,
  settle,
  visit,
  type Tab,
  type TabsState,
} from './tabs';

const key = (uid: string) => `aicv.tabs:${uid}`;
const subscribeMotion = (notify: () => void) => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
const motionSnapshot = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const serverMotion = () => true;
const horizontalOnly: Modifier = ({ transform }) => ({ ...transform, y: 0 });

/** Account-keyed children discard transient interactions and closed history on account changes. */
export function TabStrip() {
  const { user } = useAccount();
  const uid = user?.uid ?? null;
  useEffect(() => {
    if (!uid) {
      activeTab.set(null, false);
      clearAllDrafts();
    }
  }, [uid]);
  return uid ? <AccountTabStrip key={uid} uid={uid} /> : null;
}

function AccountTabStrip({ uid }: { uid: string }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = pathname + (search ? `?${search}` : '');
  const [state, setState] = useState<TabsState>(() => {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(key(uid));
    } catch {}
    return parse(saved) ?? initial(isTabHref(here) ? here : undefined);
  });
  const [recent, setRecent] = useState<Pick<Tab, 'href' | 'customTitle'>[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const heading = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const suppressClicks = useRef(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useSyncExternalStore(subscribeMotion, motionSnapshot, serverMotion);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  useEffect(() => {
    if (heading.current !== null) {
      if (heading.current !== here) return;
      heading.current = null;
    }
    setState((s) => visit(s, here));
  }, [here]);

  useEffect(() => {
    try {
      sessionStorage.setItem(key(uid), JSON.stringify(state));
    } catch {}
  }, [uid, state]);

  useEffect(() => settledWork.subscribe((id, href) => setState((s) => settle(s, id, href))), []);

  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (activeTab.get().id !== state.active) activeTab.set(state.active, false);
  }, [state.active]);

  const register = useCallback((id: string, node: HTMLButtonElement | null) => {
    if (node) buttons.current.set(id, node);
    else buttons.current.delete(id);
  }, []);

  const reveal = useCallback((id: string) => {
    const item = buttons.current.get(id)?.closest('li');
    const list = scroller.current;
    if (!item || !list) return;
    const bounds = item.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    if (bounds.left < viewport.left) list.scrollLeft += bounds.left - viewport.left - 4;
    else if (bounds.right > viewport.right) list.scrollLeft += bounds.right - viewport.right + 4;
  }, []);

  const order = state.tabs.map((tab) => tab.id).join(',');
  useLayoutEffect(() => {
    if (dragging) return;
    const list = scroller.current;
    if (!list) return;
    const observer = new ResizeObserver(() => reveal(state.active));
    observer.observe(list);
    reveal(state.active);
    return () => observer.disconnect();
  }, [state.active, order, dragging, reveal]);

  const focus = (id: string) =>
    requestAnimationFrame(() => {
      reveal(id);
      buttons.current.get(id)?.focus({ preventScroll: true });
    });

  // Only real workspace switches take this path. Metadata never touches the router/epoch.
  const go = (next: TabsState, closed?: string) => {
    const target = next.tabs.find((x) => x.id === next.active)!.href;
    try {
      sessionStorage.setItem(key(uid), JSON.stringify(next));
    } catch {}
    if (closed) clearTabDrafts(uid, closed);
    setState(next);
    if (next.active !== activeTab.get().id) activeTab.set(next.active, true);
    if (target !== here) {
      heading.current = target;
      router.push(target);
    }
  };

  const commitMove = (tabId: string, overId: string) => {
    // Reorder the latest objects so a result arriving during a drag is never lost.
    setState((latest) => reorder(latest, tabId, overId));
    const tab = state.tabs.find((tab) => tab.id === tabId);
    const position = state.tabs.findIndex((tab) => tab.id === overId) + 1;
    if (tab && position)
      setAnnouncement(
        t('{title} moved to position {position} of {count}.', {
          title: tab.customTitle ?? t(tab.title),
          position,
          count: state.tabs.length,
        }),
      );
    focus(tabId);
  };

  const collision: CollisionDetection = (args) => {
    const point = args.pointerCoordinates;
    const viewport = scroller.current?.getBoundingClientRect();
    if (
      !point ||
      !viewport ||
      point.x < viewport.left ||
      point.x > viewport.right ||
      point.y < viewport.top ||
      point.y > viewport.bottom
    )
      return [];
    return closestCenter(args);
  };

  const endDrag = (event?: DragEndEvent) => {
    suppressClicks.current = true;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      suppressClicks.current = false;
    }, 350);
    setDragging(null);
    if (event?.over && event.active.id !== event.over.id)
      commitMove(String(event.active.id), String(event.over.id));
    else if (event) focus(String(event.active.id));
  };

  const full = state.tabs.length >= MAX_TABS;
  const preview = dragging ? state.tabs.find((tab) => tab.id === dragging) : null;
  return (
    <div className="workspace-tab-rail sticky top-14 z-20 min-w-0 md:top-0" data-testid="tab-strip">
      <div className="workspace-tab-container">
        <DndContext
          sensors={sensors}
          modifiers={[horizontalOnly]}
          collisionDetection={collision}
          autoScroll={{ threshold: { x: 0.15, y: 0 }, acceleration: 8 }}
          accessibility={{
            screenReaderInstructions: {
              draggable: t('Drag to reorder, or use the workspace actions menu.'),
            },
            announcements: {
              onDragStart: ({ active }) =>
                t('Moving {title}. Press Escape to cancel.', {
                  title:
                    state.tabs.find((tab) => tab.id === active.id)?.customTitle ??
                    t(state.tabs.find((tab) => tab.id === active.id)?.title),
                }),
              onDragOver: () => undefined,
              onDragEnd: () => undefined,
              onDragCancel: () => t('Move cancelled.'),
            },
          }}
          onDragStart={({ active }) => {
            suppressClicks.current = true;
            setDragging(String(active.id));
          }}
          onDragEnd={endDrag}
          onDragCancel={({ active }) => {
            endDrag();
            focus(String(active.id));
          }}
        >
          <div ref={scroller} className="workspace-tab-scroll" data-testid="tab-scroll">
            <SortableContext
              items={state.tabs.map((tab) => tab.id)}
              strategy={horizontalListSortingStrategy}
            >
              <ul aria-label={t('Open workspaces')} className="workspace-tab-list">
                {state.tabs.map((tab, index) => (
                  <WorkspaceTabItem
                    key={tab.id}
                    tab={tab}
                    selected={tab.id === state.active}
                    editing={editing === tab.id}
                    dragging={dragging !== null}
                    reducedMotion={reducedMotion}
                    index={index}
                    count={state.tabs.length}
                    register={register}
                    onSelect={() => go(activate(state, tab.id))}
                    onClose={() => {
                      setRecent((recent) =>
                        [...recent, { href: tab.href, customTitle: tab.customTitle }].slice(-5),
                      );
                      const next = close(state, tab.id);
                      go(next, tab.id);
                      if (tab.id === state.active) focus(next.active);
                    }}
                    onStartRename={() => {
                      setEditing(tab.id);
                      reveal(tab.id);
                    }}
                    onFinishRename={(name, restoreFocus) => {
                      if (name !== undefined) setState((latest) => rename(latest, tab.id, name));
                      setEditing(null);
                      if (restoreFocus) focus(tab.id);
                    }}
                    onReset={() => {
                      setState((latest) => rename(latest, tab.id, null));
                      focus(tab.id);
                    }}
                    onMove={(direction) => {
                      const neighbour = state.tabs[index + direction];
                      if (neighbour) commitMove(tab.id, neighbour.id);
                    }}
                    suppressClick={() => suppressClicks.current}
                  />
                ))}
              </ul>
            </SortableContext>
          </div>
          {preview &&
            createPortal(
              <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
                <div className="workspace-tab-preview" aria-hidden data-testid="tab-drag-preview">
                  <span className="truncate">{preview.customTitle ?? t(preview.title)}</span>
                </div>
              </DragOverlay>,
              document.body,
            )}
        </DndContext>
        <div className="workspace-tab-tools">
          <button
            type="button"
            aria-label={t('New workspace')}
            title={
              full
                ? t('You can keep up to {n} workspaces open', { n: MAX_TABS })
                : t('New workspace')
            }
            disabled={full || dragging !== null}
            className="workspace-tab-tool workspace-tab-new"
            onClick={() => go(open(state))}
            data-testid="tab-new"
          >
            <Plus aria-hidden size={19} />
          </button>
          {recent.length > 0 && (
            <button
              type="button"
              aria-label={t('Reopen closed workspace')}
              title={t('Reopen closed workspace')}
              disabled={full || dragging !== null}
              className="workspace-tab-tool"
              onClick={() => {
                const entry = recent.at(-1)!;
                let next = open(state, entry.href);
                if (next === state) return;
                if (entry.customTitle) next = rename(next, next.active, entry.customTitle);
                setRecent((recent) => recent.slice(0, -1));
                go(next);
              }}
              data-testid="tab-reopen"
            >
              <Undo2 aria-hidden size={18} />
            </button>
          )}
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </div>
  );
}
