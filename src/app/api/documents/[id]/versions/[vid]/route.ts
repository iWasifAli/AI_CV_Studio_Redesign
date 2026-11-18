import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { NextResponse } from 'next/server';
import { apiError, readJson, requestId } from '@/lib/http';
import { currentUser } from '@/modules/identity/session';
import { cleanVersionName, versionMeta } from '@/modules/resume/versions';
import { getUserStore } from '@/modules/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; vid: string }> };
const validId = (id: string) => /^[\w-]{1,64}$/.test(id);

async function args(ctx: Ctx) {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return { error: apiError('UNAUTHORIZED', 'Please sign in.', rid) };
  const { id, vid } = await ctx.params;
  if (!validId(id) || !validId(vid))
    return { error: apiError('INVALID_INPUT', 'Invalid version.', rid) };
  return { rid, uid: user.uid, id, vid };
}

/** GET → one version with the CV as it was. */
async function handleGET(_req: Request, ctx: Ctx) {
  const a = await args(ctx);
  if ('error' in a) return a.error;
  const v = await getUserStore().getVersion(a.uid, a.id, a.vid);
  if (!v?.doc) return apiError('NOT_FOUND', 'This version was not found.', a.rid);
  return NextResponse.json(
    { version: { ...versionMeta(v), doc: v.doc } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/** PATCH { name } → renames a named version. */
async function handlePATCH(req: Request, ctx: Ctx) {
  const a = await args(ctx);
  if ('error' in a) return a.error;
  const body = await readJson(req, 4 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', a.rid);
  const name = cleanVersionName((body.value as { name?: unknown })?.name);
  if (!name) return apiError('INVALID_INPUT', 'Give this version a name.', a.rid);
  const ok = await getUserStore().renameVersion(a.uid, a.id, a.vid, name);
  if (!ok) return apiError('NOT_FOUND', 'This version was not found.', a.rid);
  return NextResponse.json({ ok: true, name });
}

async function handleDELETE(_req: Request, ctx: Ctx) {
  const a = await args(ctx);
  if ('error' in a) return a.error;
  const ok = await getUserStore().deleteVersion(a.uid, a.id, a.vid);
  if (!ok) return apiError('NOT_FOUND', 'This version was not found.', a.rid);
  return NextResponse.json({ ok: true });
}

export const GET = withWorkspaceOwnerErrors(handleGET);
export const PATCH = withWorkspaceOwnerErrors(handlePATCH);
export const DELETE = withWorkspaceOwnerErrors(handleDELETE);
