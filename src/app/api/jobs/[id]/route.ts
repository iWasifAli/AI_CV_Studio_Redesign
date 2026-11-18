import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { parseRevisionCondition, RevisionConflict } from '@/modules/store/types';
import { NextResponse } from 'next/server';
import { apiError, readJson, requestId } from '@/lib/http';
import { currentUser } from '@/modules/identity/session';
import { applyJobPatch, withSent } from '@/modules/jobs/server';
import { JobUpdateError, saveJobUpdate } from '@/modules/jobs/updates';
import { getUserStore } from '@/modules/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const noStore = { headers: { 'Cache-Control': 'no-store' } };

async function load(ctx: Ctx) {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return { error: apiError('SIGN_IN_REQUIRED', 'Please sign in.', rid) };
  const { id } = await ctx.params;
  if (!/^[\w-]{1,64}$/.test(id)) return { error: apiError('NOT_FOUND', 'Job not found.', rid) };
  const job = await getUserStore().getJob(user.uid, id);
  if (!job) return { error: apiError('NOT_FOUND', 'Job not found.', rid) };
  return { user, job, rid };
}

async function handleGET(_req: Request, ctx: Ctx) {
  const r = await load(ctx);
  if ('error' in r) return r.error;
  return NextResponse.json({ job: r.job }, noStore);
}

/** PUT partial JobInput → updated job. */
async function handlePUT(req: Request, ctx: Ctx) {
  const r = await load(ctx);
  if ('error' in r) return r.error;
  const body = await readJson(req, 64 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', r.rid);
  const now = new Date();
  const saved = await saveJobUpdate(
    r.user.uid,
    r.job.id,
    r.rid,
    async (latest) => {
      const next = applyJobPatch(latest, body.value, now);
      if ('error' in next) throw new JobUpdateError('INVALID_INPUT', next.error);
      return withSent(r.user.uid, latest, next);
    },
    { expectedRevision: (body.value as { expectedRevision?: unknown } | null)?.expectedRevision },
  );
  if ('error' in saved) return saved.error;
  return NextResponse.json({ job: saved.job }, noStore);
}

async function handleDELETE(req: Request, ctx: Ctx) {
  const r = await load(ctx);
  if ('error' in r) return r.error;
  const body = req.body ? await readJson(req, 1024) : { ok: true as const, value: {} };
  if (!body.ok) return apiError(body.code, 'Invalid request.', r.rid);
  const condition = parseRevisionCondition(body.value);
  if (!condition.ok)
    return apiError('INVALID_INPUT', 'expectedRevision must be a nonnegative integer.', r.rid);
  try {
    await getUserStore().deleteJob(r.user.uid, r.job.id, condition.value);
  } catch (error) {
    if (error instanceof RevisionConflict)
      return apiError('CONFLICT', error.message, r.rid, { current: error.current });
    throw error;
  }
  return NextResponse.json({ ok: true }, noStore);
}

export const GET = withWorkspaceOwnerErrors(handleGET);
export const PUT = withWorkspaceOwnerErrors(handlePUT);
export const DELETE = withWorkspaceOwnerErrors(handleDELETE);
