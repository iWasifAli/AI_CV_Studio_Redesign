import { NextResponse } from 'next/server';
import { apiError, readJson, requestId } from '@/lib/http';
import { currentUser } from '@/modules/identity/session';
import { safeParseResumeDocument } from '@/modules/resume/schema';
import { cleanVersionName, versionMeta } from '@/modules/resume/versions';
import { getUserStore } from '@/modules/store';
import { MAX_NAMED_VERSIONS } from '@/modules/store/types';
import { noteUse } from '@/modules/metrics/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const MAX_BODY = 768 * 1024; // same as a CV save: it may carry a small photo
const validId = (id: string) => /^[\w-]{1,64}$/.test(id);

/** GET → the CV's earlier versions, newest first (spec §9.1). */
export async function GET(_req: Request, ctx: Ctx) {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('UNAUTHORIZED', 'Please sign in.', rid);
  const { id } = await ctx.params;
  if (!validId(id)) return apiError('INVALID_INPUT', 'Invalid document.', rid);
  const versions = await getUserStore().listVersions(user.uid, id);
  return NextResponse.json(
    { versions: versions.filter((v) => v.doc).map(versionMeta), maxNamed: MAX_NAMED_VERSIONS },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * POST { kind: 'named', name, document } → keeps the CV as it is now under a name.
 * POST { kind: 'restore', name, document } → the copy taken just before going back to a version.
 */
export async function POST(req: Request, ctx: Ctx) {
  const rid = requestId();
  const user = await currentUser();
  if (user) await noteUse(user.uid, 'versions');
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
  const b = (body.value ?? {}) as { kind?: unknown; name?: unknown; document?: unknown };
  const kind = b.kind === 'restore' ? 'restore' : b.kind === 'named' ? 'named' : null;
  if (!kind) return apiError('INVALID_INPUT', 'Invalid request.', rid);
  const name = cleanVersionName(b.name);
  if (kind === 'named' && !name) return apiError('INVALID_INPUT', 'Give this version a name.', rid);
  const parsed = safeParseResumeDocument(b.document);
  if (!parsed.success || parsed.data.id !== id)
    return apiError('INVALID_INPUT', 'This CV could not be read.', rid);
  const store = getUserStore();
  const cur = await store.getDoc(user.uid, id);
  if (!cur || cur.deleted) return apiError('NOT_FOUND', 'This CV was not found.', rid);
  const saved = await store.addVersion(user.uid, id, { kind, name, doc: parsed.data });
  if (saved === 'limit')
    return apiError(
      'CONFLICT',
      `You can keep ${MAX_NAMED_VERSIONS} named versions of a CV. Delete one to save another.`,
      rid,
    );
  return NextResponse.json({ version: versionMeta(saved) }, { status: 201 });
}
