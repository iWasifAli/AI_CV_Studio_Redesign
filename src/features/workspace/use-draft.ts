'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useAccount } from '@/features/account/account-context';
import { useEntitlements } from '@/features/account/entitlements';
import { activeTab } from './active';
import { clearDraft, readDraft, writeDraft } from './drafts';

/** This screen's account and workspace tab (fixed when the screen mounts), and whether drafts are on. */
function useTabScope() {
  const { user } = useAccount();
  const { ent } = useEntitlements();
  const uid = user?.uid ?? null;
  // The tab is fixed when the screen mounts (a tab switch mounts a fresh screen), so a screen that
  // is on its way out can never write into the tab being opened. If the strip has not started yet
  // (first load), the screen takes the tab as soon as it is known.
  const live = useSyncExternalStore(
    activeTab.subscribe,
    () => activeTab.get().id,
    () => null,
  );
  const [bound, setBound] = useState<string | null>(() => activeTab.get().id);
  if (bound === null && live !== null) setBound(live);
  const on = ent?.features.workspaceTabs === true && uid !== null && bound !== null;
  return { uid, tab: bound, on };
}

/**
 * For screens that load a saved record and keep an edited copy (job details): read, write and
 * clear the draft by hand. Only a copy that differs from the saved record should be written.
 */
export function useDraftSlot<T>(name: string) {
  const { uid, tab, on } = useTabScope();
  return useMemo(
    () => ({
      read: (): T | undefined => (on ? readDraft<T>(uid!, tab!, name) : undefined),
      write: (v: T) => {
        if (on) writeDraft(uid!, tab!, name, v);
      },
      clear: () => {
        if (on) clearDraft(uid!, tab!, name);
      },
    }),
    [on, uid, tab, name],
  );
}

/**
 * `useState` for input the person has typed but not saved. With workspace tabs on, the value is
 * kept for this tab and restored when the tab is opened again (switching tabs, reloading). With
 * tabs off it behaves exactly like `useState`.
 *
 * `name` identifies the field within the page (include the record id when the screen edits one).
 * Call `clear()` once the work is saved or sent so the draft doesn't come back.
 */
export function useDraft<T>(
  name: string,
  initial: T | (() => T),
): [T, (v: T | ((prev: T) => T)) => void, () => void] {
  const { uid, tab, on } = useTabScope();
  const [value, setValue] = useState<T>(initial);
  const first = useRef<T>(value);
  // Restore once when the tab is known (on first load the strip may start a moment after the page).
  const [restored, setRestored] = useState<string | null>(null);
  const scope = on ? `${uid}:${tab}:${name}` : null;
  if (scope !== null && restored !== scope) {
    setRestored(scope);
    const saved = readDraft<T>(uid!, tab!, name);
    if (saved !== undefined) setValue(saved);
  }
  const set = useCallback((v: T | ((prev: T) => T)) => setValue(v), []);
  useEffect(() => {
    if (!on) return;
    // Only a changed value is a draft; going back to the start leaves nothing behind.
    if (JSON.stringify(value) === JSON.stringify(first.current)) clearDraft(uid!, tab!, name);
    else writeDraft(uid!, tab!, name, value);
  }, [on, uid, tab, name, value]);
  const clear = useCallback(() => {
    if (uid && tab) clearDraft(uid, tab, name);
  }, [uid, tab, name]);
  return [value, set, clear];
}
