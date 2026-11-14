import { NextResponse } from 'next/server';
import { apiError, requestId } from '@/lib/http';
import { getBusinessConfig } from '@/modules/billing/server';
import { currentUser } from '@/modules/identity/session';
import { insights, wasSent } from '@/modules/jobs/insights';
import type { SentWith } from '@/modules/jobs/schema';
import { linkedCv, sentSnapshot } from '@/modules/jobs/server';
import { getUserStore } from '@/modules/store';
import { noteUse } from '@/modules/metrics/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET → the person's application results (R9.10): sent, replies, interviews and offers, by CV
 * and by design. Worked out from their own jobs on each request; nothing extra is stored.
 */
export async function GET() {
  const rid = requestId();
  const user = await currentUser();
  if (user) await noteUse(user.uid, 'insights');
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in.', rid);
  const { value: cfg } = await getBusinessConfig();
  if (!cfg.features.jobInsights)
    return apiError('DISABLED', 'Application results are switched off right now.', rid, {
      reason: 'disabled',
    });
  const jobs = await getUserStore().listJobs(user.uid);
  // Jobs applied for before R9.10 (or before their CV reached the account) have no snapshot:
  // use the CV linked now.
  const sent = new Map<string, SentWith | null>();
  await Promise.all(
    jobs
      .filter((j) => wasSent(j))
      .map(async (j) => {
        if (j.sent) return void sent.set(j.id, j.sent);
        const cv = await linkedCv(user.uid, j);
        sent.set(j.id, cv ? await sentSnapshot(user.uid, cv) : null);
      }),
  );
  const result = insights(jobs, (j) => sent.get(j.id) ?? null);
  return NextResponse.json(
    { insights: result, total: jobs.length },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
