/**
 * Design usage (catalogue task, Part E): per design (and colour theme) and day, how often it was
 * shown in a list, previewed, chosen, left again within 5 minutes, and downloaded. Counts only —
 * no CV content and no account.
 */
import { DESIGN_IDS } from '@/modules/resume/ids';

export const USAGE_EVENTS = ['shown', 'previewed', 'chosen', 'switched', 'downloaded'] as const;
export type UsageEvent = (typeof USAGE_EVENTS)[number];
/** Events the browser may report; downloads are counted by the server itself. */
export const CLIENT_EVENTS = ['shown', 'previewed', 'chosen', 'switched'] as const;
export type UsageNote = { id: string; kind: UsageEvent; theme?: string };

/** "Left quickly": chosen, then another design chosen within this time. */
export const SWITCH_WINDOW_MS = 5 * 60_000;

const IDS = new Set<string>(DESIGN_IDS);
const THEME_RE = /^[a-z0-9-]{1,24}$/;

/** Folds notes into counter increments; drops anything not a known design or event. */
export function aggregate(notes: readonly UsageNote[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const n of notes) {
    if (!IDS.has(n.id) || !(USAGE_EVENTS as readonly string[]).includes(n.kind)) continue;
    const keys = [n.id];
    if (n.theme && THEME_RE.test(n.theme)) keys.push(`${n.id}@${n.theme}`);
    for (const k of keys) {
      const row = (out[k] ??= {});
      row[n.kind] = (row[n.kind] ?? 0) + 1;
    }
  }
  return out;
}

export type UsageRow = { id: string } & Record<
  'shown' | 'previewed' | 'chosen' | 'switchedAway' | 'downloaded',
  number
>;

/** Sums daily counters into one row per design (themes listed separately). */
export function summarise(days: { counts: Record<string, Record<string, number>> }[]): {
  rows: UsageRow[];
  themes: (UsageRow & { theme: string })[];
} {
  const sum = new Map<string, Record<string, number>>();
  for (const d of days)
    for (const [k, ev] of Object.entries(d.counts)) {
      const row = sum.get(k) ?? {};
      for (const [e, v] of Object.entries(ev)) row[e] = (row[e] ?? 0) + v;
      sum.set(k, row);
    }
  const toRow = (id: string, r: Record<string, number> = {}): UsageRow => ({
    id,
    shown: r.shown ?? 0,
    previewed: r.previewed ?? 0,
    chosen: r.chosen ?? 0,
    switchedAway: r.switched ?? 0,
    downloaded: r.downloaded ?? 0,
  });
  const rows = DESIGN_IDS.map((id) => toRow(id, sum.get(id)));
  const themes = [...sum.entries()]
    .filter(([k]) => k.includes('@'))
    .map(([k, r]) => {
      const [id, theme] = k.split('@') as [string, string];
      return { ...toRow(id, r), theme };
    });
  return { rows, themes };
}

/**
 * Popularity for the default order: designs people keep and download count most; quick
 * switches away count against. Never negative.
 */
export function popularity(rows: UsageRow[]): Record<string, number> {
  return Object.fromEntries(
    rows.map((r) => [r.id, Math.max(0, r.chosen + 2 * r.downloaded - r.switchedAway)]),
  );
}
