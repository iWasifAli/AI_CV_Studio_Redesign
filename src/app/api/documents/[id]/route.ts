import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { NextResponse } from 'next/server';
import { apiError, readJson, requestId } from '@/lib/http';
import { safeParseResumeDocument } from '@/modules/resume/schema';
import { currentUser } from '@/modules/identity/session';
import { getUserStore, MAX_DOCS_PER_USER } from '@/modules/store';
import { noteUse } from '@/modules/metrics/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const MAX_BODY = 768 * 1024; // documents may carry a small photo
const validId = (id: string) => /^[\w-]{1,64}$/.test(id);

async function handleGET(_req: Request, ctx: Ctx) {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('UNAUTHORIZED', 'Please sign in.', rid);
  const { id } = await ctx.params;
  if (!validId(id)) return apiError('INVALID_INPUT', 'Invalid document.', rid);
  const doc = await getUserStore().getDoc(user.uid, id);
  if (!doc) return apiError('NOT_FOUND', 'This CV was not found.', rid);
  return NextResponse.json(doc, { headers: { 'Cache-Control': 'no-store' } });
}

/** PUT { document } → saves if not older than the stored copy (409 with the newer copy otherwise). */
async function handlePUT(req: Request, ctx: Ctx) {
  const rid = requestId();
  const user = await currentUser();
  if (user) await noteUse(user.uid, 'cv');
  if (!user) return apiError('UNAUTHORIZED', 'Please sign in.', rid);
  const { id } = await ctx.params;
  if (!validId(id)) return apiError('INVALID_INPUT', 'Invalid document.', rid);
  const body = await readJson(req, MAX_BODY);
  if (!body.ok)
    return apiError(
      body.code,
      body.code === 'PAYLOAD_TOO_LARGE' ? 'This CV is too large.' : 'Invalid request.',
      rid,
    );
  const parsed = safeParseResumeDocument((body.value as { document?: unknown })?.document);
  if (!parsed.success || parsed.data.id !== id)
    return apiError('INVALID_INPUT', 'This CV could not be read.', rid, {
      issues: parsed.success ? [] : parsed.error.issues.slice(0, 5),
    });
  const r = await getUserStore().putDoc(user.uid, parsed.data, MAX_DOCS_PER_USER);
  if (r.ok) return NextResponse.json({ ok: true, updatedAt: r.stored.updatedAt });
  if (r.reason === 'conflict')
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: 'A newer version exists.' }, current: r.current },
      { status: 409 },
    );
  return apiError('LIMIT_REACHED', 'You have reached the maximum number of saved CVs.', rid);
}

async function handleDELETE(req: Request, ctx: Ctx) {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('UNAUTHORIZED', 'Please sign in.', rid);
  const { id } = await ctx.params;
  if (!validId(id)) return apiError('INVALID_INPUT', 'Invalid document.', rid);
  const at = new URL(req.url).searchParams.get('at') ?? new Date().toISOString();
  await getUserStore().deleteDoc(
    user.uid,
    id,
    /^\d{4}-\d\d-\d\dT/.test(at) ? at : new Date().toISOString(),
  );
  return NextResponse.json({ ok: true });
}

export const GET = withWorkspaceOwnerErrors(handleGET);
export const PUT = withWorkspaceOwnerErrors(handlePUT);
export const DELETE = withWorkspaceOwnerErrors(handleDELETE);
