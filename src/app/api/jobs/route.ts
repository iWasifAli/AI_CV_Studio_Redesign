import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalJson } from '@/modules/store/types';
import { NextResponse } from 'next/server';
import { apiError, readJson, requestId } from '@/lib/http';
import { currentUser } from '@/modules/identity/session';
import { jobInput, type Job } from '@/modules/jobs/schema';
import { jobAllowance, newJobHistory, withSent } from '@/modules/jobs/server';
import { getUserStore } from '@/modules/store';
import { noteUse } from '@/modules/metrics/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { headers: { 'Cache-Control': 'no-store' } };

/** GET → { jobs, max } for the signed-in person. */
async function handleGET() {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in to use the job tracker.', rid);
  const [{ jobs, board }, { max }] = await Promise.all([
    getUserStore().getJobBoard(user.uid),
    jobAllowance(user),
  ]);
  return NextResponse.json({ jobs, max, board }, noStore);
}

/** POST JobInput → the new job. Refused past the plan's job limit. */
async function handlePOST(req: Request) {
  const rid = requestId();
  const user = await currentUser();
  if (user) await noteUse(user.uid, 'jobs');
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in to use the job tracker.', rid);
  const body = await readJson(req, 64 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', rid);
  const parsed = jobInput.safeParse(body.value);
  if (!parsed.success)
    return apiError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid job.', rid);
  const key = req.headers.get('Idempotency-Key');
  if (key !== null && !z.uuid().safeParse(key).success)
    return apiError('INVALID_INPUT', 'Idempotency-Key must be a UUID.', rid);
  const receipt =
    key === null
      ? undefined
      : {
          key: key.toLowerCase(),
          fingerprint: createHash('sha256').update(canonicalJson(parsed.data)).digest('hex'),
        };
  const store = getUserStore();
  const { max } = await jobAllowance(user);
  const now = new Date().toISOString();
  const job: Job = {
    ...parsed.data,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    appliedOn:
      parsed.data.stage === 'applied' && !parsed.data.appliedOn
        ? now.slice(0, 10)
        : parsed.data.appliedOn,
  };
  const ready = await withSent(user.uid, null, newJobHistory(job));
  const result = await store.createJob(user.uid, ready, max, receipt);
  if (!result.ok) {
    if (result.reason === 'conflict')
      return apiError(
        'CONFLICT',
        'This creation key was already used with a different payload or its result was deleted.',
        rid,
        { current: result.current },
      );
    return apiError(
      max === 0 ? 'PREMIUM_REQUIRED' : 'LIMIT_REACHED',
      max === 0
        ? 'The job tracker isn’t included in your plan.'
        : `Your plan tracks up to ${max} jobs. Remove one you no longer need, or get Premium for more.`,
      rid,
      { reason: max === 0 ? 'premium' : 'limit', limit: max },
    );
  }
  return NextResponse.json({ job: result.value }, noStore);
}

export const GET = withWorkspaceOwnerErrors(handleGET);
export const POST = withWorkspaceOwnerErrors(handlePOST);
