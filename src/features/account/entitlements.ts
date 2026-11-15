'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { Entitlements } from '@/modules/billing/server';
import { useAccount } from './account-context';

/**
 * One copy of the entitlements per browser tab, shared by every component that asks (audit F-27:
 * each panel used to fetch its own). Fresh for 30 seconds; `refresh()` (after a download, an AI
 * action or a plan change) reloads it for everyone.
 */
const FRESH_MS = 30_000;
const shared: {
  key: string;
  at: number;
  value: Entitlements | null;
  inflight: Promise<void> | null;
  subs: Set<() => void>;
} = { key: '', at: 0, value: null, inflight: null, subs: new Set() };

function load(key: string, force = false) {
  if (shared.key !== key) {
    shared.key = key;
    shared.value = null;
    shared.at = 0;
    shared.inflight = null;
  }
  if (!force && (shared.inflight || Date.now() - shared.at < FRESH_MS)) return;
  const p = fetch('/api/me/entitlements', { cache: 'no-store' })
    .then((r) => r.json() as Promise<Entitlements>)
    .then((e) => {
      if (shared.key !== key) return;
      shared.value = e;
      shared.at = Date.now();
      for (const s of shared.subs) s();
    })
    .catch(() => {})
    .finally(() => {
      if (shared.inflight === p) shared.inflight = null;
    });
  shared.inflight = p;
}

/** The server's view of what this person may do (display only; the server enforces). */
export function useEntitlements() {
  const account = useAccount();
  const key = `${account.status}:${account.user?.uid ?? ''}`;
  const subscribe = useCallback((cb: () => void) => {
    shared.subs.add(cb);
    return () => {
      shared.subs.delete(cb);
    };
  }, []);
  const ent = useSyncExternalStore(
    subscribe,
    () => (shared.key === key ? shared.value : null),
    () => null,
  );
  useEffect(() => {
    if (!key.startsWith('loading')) load(key);
  }, [key]);
  const refresh = useCallback(() => {
    if (!key.startsWith('loading')) load(key, true);
  }, [key]);
  return { ent, refresh };
}

export function isPremiumDesign(ent: Entitlements | null, id: string) {
  return ent?.designs.find((d) => d.id === id)?.tier === 'premium';
}

export function remaining(ent: Entitlements, cap: keyof Entitlements['limits']) {
  const l = ent.limits[cap];
  return l === -1 ? Infinity : Math.max(0, l - ent.usage[cap]);
}
