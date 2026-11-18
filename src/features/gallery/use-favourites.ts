'use client';

import { workspaceFetch } from '@/features/workspace/request';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  const { status, user } = useAccount();
  const uid = status === 'signedIn' ? user?.uid : undefined;
  const session = useMemo(() => ({ uid, status }), [status, uid]);
  const active = useRef<{
    session: typeof session;
    controller: AbortController;
    ids: string[];
    version: number;
  } | null>(null);
  const [saved, setSaved] = useState<{ session: typeof session; ids: string[] } | null>(null);

  useLayoutEffect(() => {
    const controller = new AbortController();
    const local = readLocal(LOCAL);
    const run = { session, controller, ids: local, version: 0 };
    active.current = run;
    const live = () => active.current === run && !controller.signal.aborted;
    if (session.status === 'signedOut') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- account-scoped browser storage snapshot
      setSaved({ session, ids: local });
    } else if (session.status === 'signedIn' && session.uid) {
      const headers = { 'X-Workspace-Owner': session.uid };
      const version = run.version;
      void workspaceFetch('/api/me/favourites', {
        cache: 'no-store',
        signal: controller.signal,
        headers,
      })
        .then(async (r) => {
          if (!r.ok) throw new Error('Could not load favourites.');
          return r.json() as Promise<{ ids: string[] }>;
        })
        .then(async ({ ids: server }) => {
          if (!live() || run.version !== version) return;
          const merged = [...new Set([...server, ...local])];
          run.ids = merged;
          setSaved({ session, ids: merged });
          if (local.length) {
            const response = await workspaceFetch('/api/me/favourites', {
              method: 'PUT',
              signal: controller.signal,
              headers: { ...headers, 'content-type': 'application/json' },
              body: JSON.stringify({ ids: merged }),
            });
            if (live() && response.ok)
              writeLocal(
                LOCAL,
                readLocal(LOCAL).filter((id) => !local.includes(id)),
              );
          }
        })
        .catch(() => {
          if (live() && run.version === version) setSaved({ session, ids: run.ids });
        });
    }
    return () => controller.abort();
  }, [session]);

  const toggle = useCallback(
    (id: string) => {
      const run = active.current;
      if (!run || run.session !== session) return;
      const { controller } = run;
      if (controller.signal.aborted || session.status === 'loading') return;
      if (session.status === 'signedIn' && !session.uid) return;
      const next = run.ids.includes(id) ? run.ids.filter((x) => x !== id) : [id, ...run.ids];
      run.ids = next;
      run.version++;
      setSaved({ session, ids: next });
      if (session.status === 'signedIn' && session.uid) {
        void workspaceFetch('/api/me/favourites', {
          method: 'PUT',
          signal: controller.signal,
          headers: { 'content-type': 'application/json', 'X-Workspace-Owner': session.uid },
          body: JSON.stringify({ ids: next }),
        }).catch(() => undefined);
      } else writeLocal(LOCAL, next);
    },
    [session],
  );

  const ids = saved?.session === session ? saved.ids : [];
  return {
    ids,
    set: new Set(ids),
    toggle,
    ready: status !== 'loading' && saved?.session === session,
  };
}

/** Designs recently applied on this device (newest first). */
export function recentDesigns(scope: string | null = null): string[] {
  return readLocal(scope ? `${RECENT}:${scope}` : RECENT);
}
export function noteRecent(id: string, scope: string | null = null) {
  const key = scope ? `${RECENT}:${scope}` : RECENT;
  writeLocal(key, [id, ...readLocal(key).filter((x) => x !== id)].slice(0, 8));
}

let popularity: Promise<Record<string, number>> | null = null;
/** 30-day popularity from the server (once per page load). */
export function usePopularity(): Record<string, number> {
  const [scores, setScores] = useState<Record<string, number>>({});
  useEffect(() => {
    popularity ??= workspaceFetch('/api/designs/popularity')
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
