import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { NextResponse } from 'next/server';
import { apiError, readJson, requestId } from '@/lib/http';
import { currentUser } from '@/modules/identity/session';
import { DESIGN_IDS } from '@/modules/resume/ids';
import { getUserStore } from '@/modules/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IDS = new Set<string>(DESIGN_IDS);
const MAX = 200;

/** GET → { ids } — the signed-in person's favourite designs (visitors keep theirs on the device). */
async function handleGET() {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('UNAUTHORIZED', 'Please sign in.', rid);
  return NextResponse.json(
    { ids: await getUserStore().favouriteDesigns(user.uid) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/** PUT { ids } — replaces the list (unknown designs are dropped). */
async function handlePUT(req: Request) {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('UNAUTHORIZED', 'Please sign in.', rid);
  const body = await readJson(req, 8 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', rid);
  const ids = (body.value as { ids?: unknown })?.ids;
  if (!Array.isArray(ids) || ids.length > MAX)
    return apiError('INVALID_INPUT', 'Invalid list.', rid);
  const clean = [...new Set(ids.filter((x): x is string => typeof x === 'string' && IDS.has(x)))];
  await getUserStore().setFavouriteDesigns(user.uid, clean);
  return NextResponse.json({ ids: clean });
}

export const GET = withWorkspaceOwnerErrors(handleGET);
export const PUT = withWorkspaceOwnerErrors(handlePUT);
