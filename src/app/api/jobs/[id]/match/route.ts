import { NextResponse } from 'next/server';
import { apiError } from '@/lib/http';
import { runTask } from '@/modules/ai/run';
import { prepareJobAi } from '@/modules/jobs/ai-route';
import { advertFingerprint } from '@/modules/jobs/advert';
import { profileDigest } from '@/modules/jobs/digest';
import { checkMatch } from '@/modules/jobs/match';
import { JobUpdateError, saveJobUpdate } from '@/modules/jobs/updates';
import { noteUse } from '@/modules/metrics/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

/** POST { document } → job with a fresh `match` (CV vs advert, evidence checked against the CV). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const p = await prepareJobAi(req, ctx);
  if ('error' in p) return p.error;
  await noteUse(p.user.uid, 'job_match');
  const digest = profileDigest(p.doc);
  const r = await runTask(
    'job.match',
    { advert: p.job.advert.slice(0, 12_000), profile: digest.text.slice(0, 24_000) },
    0,
    p.deps,
  );
  if (!r.ok) {
    await p.done(false);
    return apiError('AI_UNAVAILABLE', 'We couldn’t check this just now. Please try again.', p.rid);
  }
  const match = checkMatch(r.result, digest, {
    sourceTitle: p.doc.title,
    sourceDocumentId: p.doc.id,
    advertFingerprint: await advertFingerprint(p.job.advert),
  });
  const now = new Date().toISOString();
  const saved = await saveJobUpdate(p.user.uid, p.job.id, p.rid, (latest) => {
    if (latest.advert !== p.job.advert)
      throw new JobUpdateError('CONFLICT', 'The job advert changed. Check again.');
    return { ...latest, match, updatedAt: now };
  });
  await p.done(!('error' in saved));
  if ('error' in saved) return saved.error;
  const { job } = saved;
  return NextResponse.json({ job }, { headers: { 'Cache-Control': 'no-store' } });
}
