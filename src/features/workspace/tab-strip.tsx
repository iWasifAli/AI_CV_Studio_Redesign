'use client';

import { useT } from '@/i18n/client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useAccount } from '@/features/account/account-context';
import { cn } from '@/lib/cn';
import { activeTab } from './active';
import { clearAllDrafts, clearTabDrafts } from './drafts';
import {
  MAX_TABS,
  activate,
  close,
  initial,
  isTabHref,
  open,
  parse,
  visit,
  type TabsState,
} from './tabs';

const key = (uid: string) => `aicv.tabs:${uid}`;

/**
 * The tab strip of the signed-in app. Each browser window keeps its own tabs (sessionStorage, per
 * account); closing the window forgets them, signing out clears them. Switching a tab opens the
 * page that tab was last on. Only the active tab's page is mounted, so one record is never open
 * twice at once and saved work stays the single source of truth.
 */
export function TabStrip() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { user } = useAccount();
  const uid = user?.uid ?? null;
  const here = pathname + (search ? `?${search}` : '');
  // The tabs of this account in this window. Read once when the account is known (during render,
  // so there is no flash of an empty strip and no extra effect).
  const [slot, setSlot] = useState<{ uid: string; state: TabsState } | null>(null);
  if (uid && slot?.uid !== uid) {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(key(uid));
    } catch {}
    setSlot({ uid, state: parse(saved) ?? initial(isTabHref(here) ? here : undefined) });
  }
  const state = slot && slot.uid === uid ? slot.state : null;
  const setState = useCallback(
    (fn: (s: TabsState) => TabsState) => setSlot((c) => (c ? { ...c, state: fn(c.state) } : c)),
    [],
  );
  // Where a tab switch is heading, so the arrival is not mistaken for ordinary navigation.
  const heading = useRef<string | null>(null);

  // Ordinary navigation inside the active tab updates that tab's page.
  useEffect(() => {
    if (heading.current !== null) {
      if (heading.current !== here) return;
      heading.current = null;
    }
    setState((s) => visit(s, here));
  }, [here, setState]);

  useEffect(() => {
    if (!uid || !state) return;
    try {
      sessionStorage.setItem(key(uid), JSON.stringify(state));
    } catch {}
  }, [uid, state]);

  const go = useCallback(
    (next: TabsState, closed?: string) => {
      if (!uid) return;
      const target = next.tabs.find((x) => x.id === next.active)!.href;
      // Saved before navigating, so the page that opens can find its tab and its drafts at once.
      try {
        sessionStorage.setItem(key(uid), JSON.stringify(next));
      } catch {}
      if (closed) clearTabDrafts(uid, closed);
      setState(() => next);
      const switched = next.active !== activeTab.get().id;
      if (switched) activeTab.set(next.active, true);
      if (target !== here) {
        heading.current = target;
        router.push(target);
      }
    },
    [uid, here, router, setState],
  );

  // Which tab is on screen: known from the first load, and cleared with the account.
  useEffect(() => {
    if (!uid || !state) {
      activeTab.set(null, false);
      if (!uid) clearAllDrafts();
      return;
    }
    if (activeTab.get().id === null) activeTab.set(state.active, false);
  }, [uid, state]);

  if (!uid || !state) return null;
  const full = state.tabs.length >= MAX_TABS;
  return (
    <div
      className="border-line bg-paper sticky top-14 z-20 flex items-center gap-1 overflow-x-auto border-b px-2 py-1 md:top-0"
      data-testid="tab-strip"
    >
      <div role="tablist" aria-label={t('Open workspaces')} className="flex min-w-0 gap-1">
        {state.tabs.map((tab) => {
          const selected = tab.id === state.active;
          return (
            <div
              key={tab.id}
              className={cn(
                'flex shrink-0 items-center rounded-md border text-sm',
                selected
                  ? 'border-line-strong bg-surface font-semibold'
                  : 'text-ink-muted hover:bg-sunken border-transparent',
              )}
            >
              <button
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={selected}
                className="min-h-9 max-w-40 truncate px-3"
                onClick={() => go(activate(state, tab.id))}
                data-testid="tab"
              >
                {t(tab.title)}
              </button>
              <button
                type="button"
                aria-label={t('Close {title}', { title: t(tab.title) })}
                className="text-ink-muted hover:text-ink grid size-9 place-items-center"
                onClick={() => go(close(state, tab.id), tab.id)}
                data-testid="tab-close"
              >
                <X aria-hidden size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        aria-label={t('New workspace')}
        title={full ? t('You can keep up to {n} workspaces open', { n: MAX_TABS }) : undefined}
        disabled={full}
        className="text-ink-muted hover:bg-sunken grid size-9 shrink-0 place-items-center rounded-md disabled:opacity-40"
        onClick={() => go(open(state))}
        data-testid="tab-new"
      >
        <Plus aria-hidden size={16} />
      </button>
    </div>
  );
}
