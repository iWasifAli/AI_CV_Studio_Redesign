'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount } from '@/features/account/account-context';

const LOCAL = 'cv.design.favourites';
const RECENT = 'cv.design.recent';

function readLocal(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function writeLocal(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Storage full or blocked: favourites then last for this visit only.
  }
}

/**
 * Favourite designs (the heart). Visitors keep them on this device; signed-in people keep them in
 * their account, and favourites made on this device before signing in are added once.
 */
export function useFavourites() {
  const { status } = useAccount();
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (status === 'loading') return;
    const local = readLocal(LOCAL);
    if (status === 'signedOut') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser storage
      setIds(local);
      return;
    }
    let live = true;
    void fetch('/api/me/favourites', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<{ ids: string[] }>) : { ids: [] }))
      .then(async ({ ids: server }) => {
        const merged = [...new Set([...server, ...local])];
        if (local.length) {
          writeLocal(LOCAL, []);
          await fetch('/api/me/favourites', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids: merged }),
          }).catch(() => undefined);
        }
        if (live) setIds(merged);
      })
      .catch(() => live && setIds(local));
    return () => {
      live = false;
    };
  }, [status]);

  const toggle = useCallback(
    (id: string) => {
      setIds((cur) => {
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur];
        if (status === 'signedIn')
          void fetch('/api/me/favourites', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids: next }),
          }).catch(() => undefined);
        else writeLocal(LOCAL, next);
        return next;
      });
    },
    [status],
  );

  return { ids, set: new Set(ids), toggle };
}

/** Designs recently applied on this device (newest first). */
export function recentDesigns(): string[] {
  return readLocal(RECENT);
}
export function noteRecent(id: string) {
  writeLocal(RECENT, [id, ...readLocal(RECENT).filter((x) => x !== id)].slice(0, 8));
}

let popularity: Promise<Record<string, number>> | null = null;
/** 30-day popularity from the server (once per page load). */
export function usePopularity(): Record<string, number> {
  const [scores, setScores] = useState<Record<string, number>>({});
  useEffect(() => {
    popularity ??= fetch('/api/designs/popularity')
      .then((r) => (r.ok ? (r.json() as Promise<{ scores: Record<string, number> }>) : null))
      .then((j) => j?.scores ?? {})
      .catch(() => ({}));
    let live = true;
    void popularity.then((s) => live && setScores(s));
    return () => {
      live = false;
    };
  }, []);
  return scores;
}
