import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/http';
import { runTask } from '@/modules/ai/run';
import { prepareJobAi } from '@/modules/jobs/ai-route';
import { profileDigest } from '@/modules/jobs/digest';
import { checkMatch } from '@/modules/jobs/match';
import { saveGeneratedJobUpdate } from '@/modules/jobs/updates';
import { noteUse } from '@/modules/metrics/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

/** POST { document } → job with a fresh `match` (CV vs advert, evidence checked against the CV). */
async function handlePOST(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
  await p.done(r.ok);
  if (!r.ok)
    return apiError('AI_UNAVAILABLE', 'We couldn’t check this just now. Please try again.', p.rid);
  const match = checkMatch(r.result, digest, { sourceTitle: p.doc.title });
  const now = new Date().toISOString();
  const saved = await saveGeneratedJobUpdate(p, (latest) => ({
    ...latest,
    match,
    updatedAt: now,
  }));
  if ('error' in saved) return saved.error;
  const { job } = saved;
  return NextResponse.json({ job }, { headers: { 'Cache-Control': 'no-store' } });
}

export const POST = withWorkspaceOwnerErrors(handlePOST);
