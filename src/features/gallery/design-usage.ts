'use client';

import { useEffect, type RefObject } from 'react';
import { SWITCH_WINDOW_MS, type UsageNote } from '@/modules/design/usage';

/**
 * Design usage from the browser (catalogue Part E), counted once per action:
 *  - shown: a design card came into view (once per design per page visit);
 *  - previewed: its full preview was opened;
 *  - chosen: it was applied to a CV — and when another design is chosen within 5 minutes, the
 *    earlier one is counted as "left quickly".
 * Notes are sent in batches; nothing about the person or their CV is sent.
 */
const MAX_BATCH = 80;
let queue: UsageNote[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let shownOnce = new Set<string>();
const LAST_KEY = 'cv.design.lastChoice';

type Sender = (events: UsageNote[], beacon: boolean) => void;
let send: Sender = (events, beacon) => {
  const body = JSON.stringify({ events });
  if (beacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon('/api/metrics/design', new Blob([body], { type: 'application/json' }));
    return;
  }
  void fetch('/api/metrics/design', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
};

export function flushUsage(beacon = false) {
  if (timer) clearTimeout(timer);
  timer = null;
  while (queue.length) send(queue.splice(0, MAX_BATCH), beacon);
}

function push(n: UsageNote) {
  queue.push(n);
  if (queue.length >= MAX_BATCH) return flushUsage();
  if (!timer) timer = setTimeout(() => flushUsage(), 1500);
}

if (typeof window !== 'undefined')
  window.addEventListener('pagehide', () => flushUsage(true), { capture: true });

/** A new page visit (a list mounted): designs may be counted as shown again. */
export function newVisit() {
  shownOnce = new Set();
}

export function noteShown(id: string) {
  if (shownOnce.has(id)) return;
  shownOnce.add(id);
  push({ id, kind: 'shown' });
}

export function notePreviewed(id: string, theme?: string) {
  push({ id, kind: 'previewed', ...(theme ? { theme } : {}) });
}

export function noteChosen(id: string, theme?: string, now = Date.now()) {
  let last: { id: string; theme?: string; at: number } | null = null;
  try {
    last = JSON.parse(sessionStorage.getItem(LAST_KEY) ?? 'null');
  } catch {
    last = null;
  }
  if (last && last.id !== id && now - last.at < SWITCH_WINDOW_MS)
    push({ id: last.id, kind: 'switched', ...(last.theme ? { theme: last.theme } : {}) });
  try {
    sessionStorage.setItem(LAST_KEY, JSON.stringify({ id, theme, at: now }));
  } catch {
    // Storage may be unavailable (private mode); switching is then not counted.
  }
  push({ id, kind: 'chosen', ...(theme ? { theme } : {}) });
}

/** Counts a card as shown once at least half of it is on screen. */
export function useShown(ref: RefObject<Element | null>, id: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          noteShown(id);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, id]);
}

/** For tests: capture what would be sent. */
export function __setSender(s: Sender) {
  send = s;
  queue = [];
  shownOnce = new Set();
}
