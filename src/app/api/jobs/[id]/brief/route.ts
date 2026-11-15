import { NextResponse } from 'next/server';
import { apiError, requestId } from '@/lib/http';
import { runTask } from '@/modules/ai/run';
import { getBusinessConfig } from '@/modules/billing/server';
import { prepareJobAi } from '@/modules/jobs/ai-route';
import { profileDigest } from '@/modules/jobs/digest';
import { noteUse } from '@/modules/metrics/activity';
import { track } from '@/modules/metrics/server';
import { getUserStore } from '@/modules/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST { document, pages? } → { job } with a company brief (spec §10.2): what the company does
 * and values (from the advert and text the person pasted), what the role needs, how the CV fits,
 * and questions to ask. One AI action.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { value: cfg } = await getBusinessConfig();
  if (!cfg.features.companyBrief)
    return apiError('DISABLED', 'Company briefs are switched off right now.', requestId(), {
      reason: 'disabled',
    });
  const p = await prepareJobAi(req, ctx, cfg.aiWeights.brief);
  if ('error' in p) return p.error;
  await noteUse(p.user.uid, 'jobs');
  const pages =
    typeof p.body.pages === 'string'
      ? p.body.pages.replace(/\s+/g, ' ').trim().slice(0, 12_000)
      : '';
  const r = await runTask(
    'job.brief',
    {
      title: p.job.title,
      company: p.job.company,
      advert: p.job.advert.slice(0, 12_000),
      pages,
      profile: profileDigest(p.doc).text.slice(0, 24_000),
    },
    0,
    p.deps,
  );
  await p.done(r.ok);
  if (!r.ok)
    return apiError(
      'AI_UNAVAILABLE',
      'We couldn’t write the brief just now. Please try again.',
      p.rid,
    );
  await track('brief_ok');
  const job = {
    ...p.job,
    brief: { ...r.result, at: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  };
  await getUserStore().putJob(p.user.uid, job);
  return NextResponse.json({ job }, { headers: { 'Cache-Control': 'no-store' } });
}
