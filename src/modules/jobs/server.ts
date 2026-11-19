import 'server-only';
import { getBusinessConfig, planFor } from '@/modules/billing/server';
import type { SessionUser } from '@/modules/identity/session';
import { getUserStore } from '@/modules/store';
import { currentDesignId } from '@/modules/design/catalogue';
import { DESIGN_META } from '@/modules/design/designs';
import type { ResumeDocument } from '@/modules/resume/schema';
import { trackStage, wasSent } from './insights';
import { jobInput, type Job, type SentWith } from './schema';

/** How many jobs this person may track (-1 = no limit). */
export async function jobAllowance(user: SessionUser) {
  const [{ plan }, { value: cfg }] = await Promise.all([planFor(user), getBusinessConfig()]);
  return { plan, max: cfg.plans[plan].maxJobs };
}

/** Applies a partial update; moving to "applied" stamps today's date if none was set. */
export function applyJobPatch(cur: Job, patch: unknown, now = new Date()): Job | { error: string } {
  const merged = jobInput.safeParse({ ...cur, ...(patch as object) });
  if (!merged.success) return { error: merged.error.issues[0]?.message ?? 'Invalid job.' };
  const next: Job = { ...cur, ...merged.data, updatedAt: now.toISOString() };
  if (next.advert !== cur.advert) delete next.match;
  if (next.stage === 'applied' && cur.stage !== 'applied' && !next.appliedOn)
    next.appliedOn = now.toISOString().slice(0, 10);
  // R9.10: the stages reached, and how it ended (only while closed).
  if (next.stage !== cur.stage) next.reached = trackStage(cur, next.stage, now);
  if (next.stage !== 'closed') next.outcome = '';
  return next;
}

/** The first history of a new job (it may be added straight into a later stage). */
export function newJobHistory(job: Job, now = new Date()): Job {
  const blank: Job = { ...job, stage: 'saved', appliedOn: '', reached: {} };
  const reached = job.stage === 'saved' ? {} : trackStage(blank, job.stage, now);
  if (job.appliedOn && reached.applied !== undefined) reached.applied = job.appliedOn;
  return { ...job, reached, outcome: job.stage === 'closed' ? job.outcome : '' };
}

const docTitle = (d: ResumeDocument) => d.title || d.basics.name || 'Untitled CV';

/** A snapshot of a CV as sent: its title, whether it was tailored, and its design. */
export async function sentSnapshot(uid: string, d: ResumeDocument): Promise<SentWith> {
  const designId = currentDesignId(d.design);
  const meta = designId ? DESIGN_META[designId] : undefined;
  const tailored = !!d.jobId && !!d.parentId;
  let baseTitle: string | undefined;
  if (tailored) {
    const base = await getUserStore().getDoc(uid, d.parentId!);
    if (base?.doc && !base.deleted) baseTitle = docTitle(base.doc);
  }
  return {
    cvId: d.id,
    title: docTitle(d),
    tailored,
    ...(tailored ? { baseId: d.parentId, ...(baseTitle ? { baseTitle } : {}) } : {}),
    designId: meta ? meta.id : null,
    designName: meta ? meta.name : 'Your own design',
  };
}

/** The CV sent for a job: the most recently linked one that still exists (the kit adds its CV last). */
export async function linkedCv(uid: string, job: Job): Promise<ResumeDocument | null> {
  const store = getUserStore();
  for (const id of [...job.documentIds].reverse()) {
    const d = await store.getDoc(uid, id);
    if (d?.doc && !d.deleted) return d.doc;
  }
  return null;
}

/**
 * Keeps `sent` (R9.10) in step: once a job is applied for, the CV linked then is recorded as it
 * was, so later edits or a new design don't rewrite history. It changes only when the person
 * links a different CV.
 */
export async function withSent(uid: string, prev: Job | null, next: Job): Promise<Job> {
  if (!wasSent(next)) return next;
  const unchanged =
    prev &&
    wasSent(prev) &&
    !!prev.sent &&
    JSON.stringify(prev.documentIds) === JSON.stringify(next.documentIds);
  if (unchanged) return next;
  const cv = await linkedCv(uid, next);
  if (!cv) return { ...next, sent: null };
  if (next.sent && next.sent.cvId === cv.id) return next;
  return { ...next, sent: await sentSnapshot(uid, cv) };
}

export async function listJobs(uid: string) {
  return getUserStore().listJobs(uid);
}
