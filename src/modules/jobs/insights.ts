import type { Job, JobStage, SentWith, StageDates } from './schema';

/**
 * Application analytics (R9.10, spec §10.2: "applications sent, replies, interviews, by CV
 * version and design"). Pure functions over the person's own jobs; nothing leaves the account.
 */

const ORDER: Record<JobStage, number> = { saved: 0, applied: 1, interview: 2, offer: 3, closed: 4 };
const day = (iso: string) => iso.slice(0, 10);

/**
 * The stages a job has reached. Jobs from before R9.10 have no history, so it is worked out from
 * where they are now; those dates are '' (reached, day unknown) and never used for timing.
 */
export function reachedOf(job: Job): StageDates {
  if (job.reached) return job.reached;
  const r: StageDates = {};
  const at = ORDER[job.stage];
  if (job.appliedOn || (at >= 1 && at <= 3)) r.applied = job.appliedOn || '';
  if (job.stage === 'interview' || job.stage === 'offer') r.interview = '';
  if (job.stage === 'offer') r.offer = '';
  if (job.stage === 'closed') r.closed = '';
  return r;
}

/**
 * History after a stage change. Moving forward stamps today on the new stage (and on Applied when
 * skipping straight to Interview or Offer). Moving back to an open stage is a correction, so later
 * stages are forgotten. Closing keeps the furthest stage reached before it.
 */
export function trackStage(prev: Job, stage: JobStage, now = new Date()): StageDates {
  const r: StageDates = { ...reachedOf(prev) };
  delete r.saved;
  if (stage === prev.stage) return r;
  const today = day(now.toISOString());
  if (stage === 'closed') {
    r.closed = today;
    return r;
  }
  for (const s of Object.keys(r) as JobStage[]) if (ORDER[s] > ORDER[stage]) delete r[s];
  if (stage !== 'saved' && r[stage] === undefined) r[stage] = today;
  if (ORDER[stage] >= 2 && r.applied === undefined) r.applied = prev.appliedOn || today;
  return r;
}

/** True when the application was actually sent. */
export function wasSent(job: Job): boolean {
  if (job.outcome === 'not_applied') return false;
  return !!job.appliedOn || reachedOf(job).applied !== undefined;
}

export type AppFacts = {
  appliedOn: string;
  replied: boolean;
  interview: boolean;
  offer: boolean;
  /** Applied, no answer yet, still open. */
  waiting: boolean;
  /** Days from applying to the first answer, when both days are known. */
  daysToReply: number | null;
};

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** What one sent application tells us. */
export function factsOf(job: Job): AppFacts {
  const r = reachedOf(job);
  const offer = r.offer !== undefined || job.outcome === 'accepted' || job.outcome === 'declined';
  const interview = offer || r.interview !== undefined;
  const closed = job.stage === 'closed';
  const rejected = closed && job.outcome === 'rejected';
  const replied = interview || rejected;
  const appliedOn = job.appliedOn || r.applied || '';
  const answers = [r.interview, r.offer, rejected ? r.closed : undefined].filter(
    (d): d is string => !!d,
  );
  const first = answers.sort()[0];
  const gap = appliedOn && first ? daysBetween(appliedOn, first) : null;
  return {
    appliedOn,
    replied,
    interview,
    offer,
    waiting: !replied && !closed,
    daysToReply: gap !== null && gap >= 0 && gap <= 365 ? gap : null,
  };
}

export type Group = {
  key: string;
  label: string;
  sent: number;
  replies: number;
  interviews: number;
  offers: number;
};

export type Insights = {
  sent: number;
  replies: number;
  interviews: number;
  offers: number;
  waiting: number;
  /** Closed with no answer (no reply, withdrew, or no reason given). */
  noReply: number;
  /** Median days from applying to the first answer (null with fewer than 2 known). */
  medianDaysToReply: number | null;
  /** Jobs saved but not applied to yet (open). */
  saved: number;
  byCv: Group[];
  byDesign: Group[];
  /** Applications per week, oldest first (12 weeks ending this week; weeks start on Monday). */
  weeks: { start: string; count: number }[];
  /** Closed applications with no outcome given (asked for in the UI). */
  missingOutcome: { id: string; title: string; company: string }[];
  /** Sent applications with no CV linked. */
  noCv: { id: string; title: string; company: string }[];
};

/** Below this many applications a group's rates are not shown as a comparison. */
export const FEW = 5;

function cvGroup(s: SentWith | null): { key: string; label: string } {
  if (!s) return { key: 'none', label: 'No CV linked' };
  if (s.tailored)
    return s.baseTitle
      ? { key: `t:${s.baseId ?? ''}`, label: `Tailored copies of “${s.baseTitle}”` }
      : { key: 't:', label: 'Tailored copies' };
  return { key: `c:${s.cvId}`, label: s.title };
}
function designGroup(s: SentWith | null): { key: string; label: string } {
  if (!s) return { key: 'none', label: 'No CV linked' };
  return s.designId
    ? { key: s.designId, label: s.designName }
    : { key: 'own', label: 'Your own designs' };
}

function mondayOf(d: string) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

/**
 * The person's application results. `sentOf` gives the CV sent for each job: the stored snapshot,
 * or (for jobs applied to before R9.10) the CV linked now.
 */
export function insights(
  jobs: Job[],
  sentOf: (j: Job) => SentWith | null,
  now = new Date(),
): Insights {
  const out: Insights = {
    sent: 0,
    replies: 0,
    interviews: 0,
    offers: 0,
    waiting: 0,
    noReply: 0,
    medianDaysToReply: null,
    saved: 0,
    byCv: [],
    byDesign: [],
    weeks: [],
    missingOutcome: [],
    noCv: [],
  };
  const cv = new Map<string, Group>();
  const design = new Map<string, Group>();
  const gaps: number[] = [];
  const thisWeek = mondayOf(day(now.toISOString()));
  const weeks = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    const t = new Date(`${thisWeek}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() - 7 * i);
    weeks.set(t.toISOString().slice(0, 10), 0);
  }
  const add = (m: Map<string, Group>, g: { key: string; label: string }, f: AppFacts) => {
    const row = m.get(g.key) ?? { ...g, sent: 0, replies: 0, interviews: 0, offers: 0 };
    row.sent++;
    if (f.replied) row.replies++;
    if (f.interview) row.interviews++;
    if (f.offer) row.offers++;
    m.set(g.key, row);
  };

  for (const job of jobs) {
    if (!wasSent(job)) {
      if (job.stage !== 'closed') out.saved++;
      continue;
    }
    const f = factsOf(job);
    out.sent++;
    if (f.replied) out.replies++;
    if (f.interview) out.interviews++;
    if (f.offer) out.offers++;
    if (f.waiting) out.waiting++;
    if (!f.replied && !f.waiting) out.noReply++;
    if (f.daysToReply !== null) gaps.push(f.daysToReply);
    if (f.appliedOn) {
      const w = mondayOf(f.appliedOn);
      if (weeks.has(w)) weeks.set(w, weeks.get(w)! + 1);
    }
    const brief = { id: job.id, title: job.title, company: job.company };
    if (job.stage === 'closed' && !job.outcome && !f.interview) out.missingOutcome.push(brief);
    const s = sentOf(job);
    if (!s) out.noCv.push(brief);
    add(cv, cvGroup(s), f);
    add(design, designGroup(s), f);
  }
  gaps.sort((a, b) => a - b);
  if (gaps.length >= 2) {
    const mid = gaps.length / 2;
    out.medianDaysToReply = Number.isInteger(mid)
      ? Math.round((gaps[mid - 1]! + gaps[mid]!) / 2)
      : gaps[Math.floor(mid)]!;
  }
  const order = (a: Group, b: Group) =>
    (a.key === 'none' ? 1 : 0) - (b.key === 'none' ? 1 : 0) ||
    b.sent - a.sent ||
    a.label.localeCompare(b.label);
  out.byCv = [...cv.values()].sort(order);
  out.byDesign = [...design.values()].sort(order);
  out.weeks = [...weeks].map(([start, count]) => ({ start, count }));
  return out;
}

/** Whole-number percentage, or null when there is nothing to divide by. */
export const pct = (n: number, of: number) => (of > 0 ? Math.round((100 * n) / of) : null);
