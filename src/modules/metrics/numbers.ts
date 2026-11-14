/**
 * Product numbers (spec §17.2). The per-account activity record and the pure maths that turns
 * activity records and daily counters into the nine numbers on the Admin overview. Only dates and
 * tool names are kept per account — never CV content, names or emails.
 */

/** The studio's tools, counted once a day per account when used. */
export const TOOLS = [
  'cv',
  'makeover',
  'pdf',
  'word',
  'ai_writing',
  'designer',
  'jobs',
  'job_match',
  'kit',
  'letters',
  'ats',
  'coach',
  'mock',
  'stories',
  'skills',
  'portfolio',
  'share',
  'linkedin',
  'proofread',
  'quantify',
  'versions',
  'insights',
] as const;
export type Tool = (typeof TOOLS)[number];

export type Activity = {
  uid: string;
  /** Day the account started (yyyy-mm-dd). */
  since: string;
  /** Last day the account did anything. */
  lastDay: string;
  /** Weeks since `since` (0 = first week) in which the account was active. */
  weeks: number[];
  /** Last day each tool was used. */
  tools: Partial<Record<Tool, string>>;
  /** When the free AI Designer try was used (ISO). */
  freeComposeAt?: string;
  /** When the account's first pass was bought — a paid order approved, not a grant (ISO). */
  premiumAt?: string;
  /** Last AI Designer compose (ISO), to tell a replaced first design. */
  composeAt?: string;
  /** Last makeover reveal saved to this account (ISO), and whether a PDF followed in 24 hours. */
  revealAt?: string;
  revealDownloaded?: boolean;
};

const DAY = 86_400_000;
export const dayOf = (d: Date | string) =>
  (typeof d === 'string' ? new Date(d) : d).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.floor(
    (Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / DAY,
  );

/** The record after one more use (pure; the store applies it in a transaction). */
export function withUse(
  cur: Activity | null,
  uid: string,
  tool: Tool | null,
  now: Date,
  since?: string,
): Activity {
  const day = dayOf(now);
  const a: Activity = cur
    ? { ...cur, weeks: [...cur.weeks], tools: { ...cur.tools } }
    : { uid, since: since ? dayOf(since) : day, lastDay: day, weeks: [], tools: {} };
  a.lastDay = day;
  const week = Math.max(0, Math.floor(daysBetween(a.since, day) / 7));
  if (!a.weeks.includes(week)) a.weeks = [...a.weeks, week].sort((x, y) => x - y).slice(-60);
  if (tool) a.tools[tool] = day;
  return a;
}

/** Time-to-reveal buckets (seconds), counted per makeover as `makeover_ms_<bucket>`. */
export const REVEAL_BUCKETS = [10, 20, 30, 60] as const;
export type RevealBucket = `makeover_ms_${(typeof REVEAL_BUCKETS)[number]}` | 'makeover_ms_more';
export function revealBucket(ms: number): RevealBucket {
  const s = ms / 1000;
  const b = REVEAL_BUCKETS.find((x) => s < x);
  return b ? `makeover_ms_${b}` : 'makeover_ms_more';
}

export type Num = {
  key: string;
  label: string;
  /** The value as a ratio (0–1), a number of seconds or of tools; null without enough data. */
  value: number | null;
  /** How it is shown: percent, seconds or a count. */
  unit: 'percent' | 'seconds' | 'count';
  target: number;
  /** True when a lower value is better (time to reveal). */
  lower?: boolean;
  /** How many accounts or events the number is based on. */
  base: number;
  definition: string;
};

/** Below this many accounts or events a number is shown as "not enough data yet". */
export const MIN_BASE = 5;

const ratio = (n: number, of: number) => (of > 0 ? n / of : null);

/**
 * The nine numbers from spec §17.2. `counts` are the daily counters summed over the window
 * (usually 30 days); `acts` are all activity records.
 */
export function productNumbers(
  counts: Record<string, number>,
  acts: Activity[],
  now = new Date(),
): Num[] {
  const c = (k: string) => counts[k] ?? 0;
  const today = dayOf(now);
  const ago = (iso: string) => daysBetween(iso, today);

  // Time to reveal: the bucket that holds the middle makeover.
  const buckets = [...REVEAL_BUCKETS.map((b) => `makeover_ms_${b}`), 'makeover_ms_more'];
  const timed = buckets.reduce((n, k) => n + c(k), 0);
  let median: number | null = null;
  if (timed) {
    let run = 0;
    for (const [i, k] of buckets.entries()) {
      run += c(k);
      if (run >= timed / 2) {
        median = REVEAL_BUCKETS[i] ?? 90;
        break;
      }
    }
  }

  // Tools per active account: distinct tools used in the last 30 days.
  const active = acts.filter((a) => ago(a.lastDay) < 30);
  const toolCounts = active.map(
    (a) => Object.values(a.tools).filter((d) => d && ago(d) < 30).length,
  );
  const avgTools = toolCounts.length
    ? toolCounts.reduce((x, y) => x + y, 0) / toolCounts.length
    : null;

  // Week-4 return: accounts that started 28–90 days ago (week 4 fully passed), active in week 4.
  const week4 = acts.filter((a) => ago(a.since) >= 28 && ago(a.since) < 90);
  const back = week4.filter((a) => a.weeks.includes(3)).length;

  // Free → Premium within 30 days: accounts that started 30–120 days ago.
  const cohort30 = acts.filter((a) => ago(a.since) >= 30 && ago(a.since) < 120);
  const bought30 = cohort30.filter(
    (a) => a.premiumAt && daysBetween(a.since, a.premiumAt) <= 30,
  ).length;

  // Designer → Premium: free tries at least 7 days ago (last 120 days); bought within 7 days.
  const tried = acts.filter(
    (a) => a.freeComposeAt && ago(a.freeComposeAt) >= 7 && ago(a.freeComposeAt) < 120,
  );
  const triedBought = tried.filter(
    (a) =>
      a.premiumAt &&
      a.premiumAt >= a.freeComposeAt! &&
      Date.parse(a.premiumAt) - Date.parse(a.freeComposeAt!) <= 7 * DAY,
  ).length;

  const started = c('makeover_start');
  const reveals = c('makeover_reveal');
  const visitorReveals = c('makeover_preview');
  const composes = c('design_compose');
  const firstKept = Math.max(0, composes - c('designer_first_replaced'));

  return [
    {
      key: 'makeoverCompletion',
      label: 'Makeover completion',
      value: ratio(reveals, started),
      unit: 'percent',
      target: 0.9,
      base: started,
      definition: 'Files dropped that reach the reveal',
    },
    {
      key: 'timeToReveal',
      label: 'Time to reveal',
      value: median,
      unit: 'seconds',
      target: 30,
      lower: true,
      base: timed,
      definition:
        'Middle time from upload to the reveal, on the server (at most this many seconds)',
    },
    {
      key: 'revealToAccount',
      label: 'Reveal → account',
      value: ratio(c('makeover_saved_visitor'), visitorReveals),
      unit: 'percent',
      target: 0.35,
      base: visitorReveals,
      definition: 'Visitors who sign up and save after the reveal',
    },
    {
      key: 'revealToDownload',
      label: 'Reveal → download',
      value: ratio(c('makeover_download_24h'), reveals),
      unit: 'percent',
      target: 0.5,
      base: reveals,
      definition: 'Makeovers that end in a PDF download within 24 hours',
    },
    {
      key: 'designerMatch',
      label: 'Designer match',
      value: ratio(firstKept, composes),
      unit: 'percent',
      target: 0.6,
      base: composes,
      definition: 'First design kept (not replaced within 5 minutes)',
    },
    {
      key: 'designerToPremium',
      label: 'Designer → Premium',
      value: ratio(triedBought, tried.length),
      unit: 'percent',
      target: 0.08,
      base: tried.length,
      definition: 'Free users who buy within 7 days of their free AI design',
    },
    {
      key: 'toolsPerUser',
      label: 'Tools per active user',
      value: avgTools,
      unit: 'count',
      target: 3,
      base: active.length,
      definition: 'Different studio tools used in the last 30 days, on average',
    },
    {
      key: 'week4Return',
      label: 'Week-4 return',
      value: ratio(back, week4.length),
      unit: 'percent',
      target: 0.25,
      base: week4.length,
      definition: 'Accounts active again in their fourth week',
    },
    {
      key: 'freeToPremium',
      label: 'Free → Premium',
      value: ratio(bought30, cohort30.length),
      unit: 'percent',
      target: 0.04,
      base: cohort30.length,
      definition: 'Accounts that buy a pass within 30 days of starting',
    },
  ];
}

/** On track, below target, or not enough data yet. */
export function numberStatus(n: Num): 'ok' | 'below' | 'few' {
  if (n.value === null || n.base < MIN_BASE) return 'few';
  return (n.lower ? n.value <= n.target : n.value >= n.target) ? 'ok' : 'below';
}
