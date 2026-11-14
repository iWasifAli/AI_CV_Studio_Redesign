import 'server-only';
import { getUserStore } from '@/modules/store';
import { dayOf, withUse, type Activity, type Tool } from './numbers';
import { track, type MetricEvent } from './server';

/**
 * Per-account activity for the product numbers (spec §17.2). Each call marks the account active
 * today and, with a tool, that the tool was used today. Only dates and tool names are stored.
 * Never throws and never slows a request by more than one small write.
 */

const noted = new Set<string>();

/** When the account was created (Firebase Auth), or null when it can't be read. */
async function createdAt(uid: string): Promise<string | null> {
  if (process.env.NODE_ENV === 'test') return null;
  try {
    const { adminAuth } = await import('@/lib/firebase-admin');
    const u = await adminAuth().getUser(uid);
    return u.metadata.creationTime ? new Date(u.metadata.creationTime).toISOString() : null;
  } catch {
    return null;
  }
}

/** Week numbers recomputed after the start day changes (only the current week is known). */
function restart(a: Activity, since: string, now: Date): Activity {
  const day = dayOf(now);
  const week = Math.max(
    0,
    Math.floor(
      (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / (7 * 86_400_000),
    ),
  );
  return { ...a, since, weeks: [week] };
}

/**
 * Notes a use. `edit` may change the record further and return a metric event to count (for
 * example a makeover that ended in a download).
 */
export async function noteUse(
  uid: string,
  tool: Tool | null,
  edit?: (a: Activity, now: Date) => MetricEvent | void,
  now = new Date(),
): Promise<void> {
  const key = `${uid}:${tool ?? '-'}:${dayOf(now)}`;
  if (!edit && noted.has(key)) return;
  try {
    const out: { event?: MetricEvent } = {};
    const store = getUserStore();
    const { before, after } = await store.updateActivity(uid, (cur) => {
      const a = withUse(cur, uid, tool, now);
      out.event = edit?.(a, now) || undefined;
      return a;
    });
    if (noted.size > 20_000) noted.clear();
    noted.add(key);
    if (out.event) await track(out.event);
    // A record made for an account that existed before activity was kept: date it from sign-up.
    if (!before && after) {
      const made = await createdAt(uid);
      if (made && dayOf(made) < after.since)
        await store.updateActivity(uid, (cur) => (cur ? restart(cur, dayOf(made), now) : cur));
    }
  } catch (e) {
    console.warn(
      JSON.stringify({ level: 'warn', area: 'activity', tool, message: (e as Error).message }),
    );
  }
}

/** Records the first bought pass (an approved paid order). Does not mark the account active. */
export async function notePremium(uid: string, now = new Date()): Promise<void> {
  try {
    const store = getUserStore();
    const { before } = await store.updateActivity(uid, (cur) => {
      const a = cur ?? withUse(null, uid, null, now);
      if (!a.premiumAt) a.premiumAt = now.toISOString();
      return a;
    });
    if (!before) {
      const made = await createdAt(uid);
      if (made)
        await store.updateActivity(uid, (cur) => (cur ? restart(cur, dayOf(made), now) : cur));
    }
  } catch (e) {
    console.warn(
      JSON.stringify({ level: 'warn', area: 'activity', message: (e as Error).message }),
    );
  }
}

const FIVE_MIN = 5 * 60_000;
const DAY = 86_400_000;

/** AI Designer compose: marks the free try, and counts a first design replaced within 5 minutes. */
export function noteCompose(uid: string, free: boolean) {
  return noteUse(uid, 'designer', (a, now) => {
    const replaced = a.composeAt && now.getTime() - Date.parse(a.composeAt) < FIVE_MIN;
    a.composeAt = now.toISOString();
    if (free && !a.freeComposeAt) a.freeComposeAt = a.composeAt;
    return replaced ? 'designer_first_replaced' : undefined;
  });
}

/** A makeover reveal now belongs to this account (signed-in reveal, or a visitor's saved one). */
export function noteReveal(uid: string) {
  return noteUse(uid, 'makeover', (a, now) => {
    a.revealAt = now.toISOString();
    a.revealDownloaded = false;
  });
}

/** A PDF download: counts the makeover that led to it, once, within 24 hours of the reveal. */
export function notePdf(uid: string) {
  return noteUse(uid, 'pdf', (a, now) => {
    if (!a.revealAt || a.revealDownloaded) return;
    if (now.getTime() - Date.parse(a.revealAt) > DAY) return;
    a.revealDownloaded = true;
    return 'makeover_download_24h';
  });
}
