import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/http';
import { runTask } from '@/modules/ai/run';
import { prepareJobAi } from '@/modules/jobs/ai-route';
import { profileDigest } from '@/modules/jobs/digest';
import { saveGeneratedJobUpdate } from '@/modules/jobs/updates';
import { noteUse } from '@/modules/metrics/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

/** POST { document, tone } → job with a drafted `letter` (facts only from the CV; guarded). */
async function handlePOST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const p = await prepareJobAi(req, ctx);
  if ('error' in p) return p.error;
  await noteUse(p.user.uid, 'letters');
  const tone = p.body.tone === 'formal' ? 'formal' : 'warm';
  const r = await runTask(
    'letter.write',
    {
      advert: p.job.advert.slice(0, 12_000),
      jobTitle: p.job.title,
      company: p.job.company,
      name: p.doc.basics.name,
      profile: profileDigest(p.doc).text.slice(0, 24_000),
      tone,
    },
    0,
    p.deps,
  );
  await p.done(r.ok);
  if (!r.ok)
    return apiError(
      'AI_UNAVAILABLE',
      'We couldn’t write a draft just now. Please try again.',
      p.rid,
    );
  const now = new Date().toISOString();
  const saved = await saveGeneratedJobUpdate(p, (latest) => ({
    ...latest,
    letter: { ...r.result, tone, documentId: p.doc.id, updatedAt: now },
    updatedAt: now,
  }));
  if ('error' in saved) return saved.error;
  const { job } = saved;
  return NextResponse.json(
    { job, findings: r.findings.length },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const POST = withWorkspaceOwnerErrors(handlePOST);
