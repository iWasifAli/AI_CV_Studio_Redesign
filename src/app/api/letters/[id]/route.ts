import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { z } from 'zod';
import { parseRevisionCondition, RevisionConflict } from '@/modules/store/types';
import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/http';
import { savedLetterInput } from '@/modules/letters/schema';
import { loadLetter, type LetterCtx } from '@/modules/letters/server';
import { getUserStore } from '@/modules/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { headers: { 'Cache-Control': 'no-store' } };

async function handleGET(_req: Request, ctx: LetterCtx) {
  const r = await loadLetter(ctx);
  if ('error' in r) return r.error;
  return NextResponse.json({ letter: r.letter }, noStore);
}

/** PUT partial SavedLetterInput → the updated letter (the type can't change). */
async function handlePUT(req: Request, ctx: LetterCtx) {
  const r = await loadLetter(ctx);
  if ('error' in r) return r.error;
  const body = await readJson(req, 64 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', r.rid);
  const condition = parseRevisionCondition(body.value);
  if (!condition.ok)
    return apiError('INVALID_INPUT', 'expectedRevision must be a nonnegative integer.', r.rid);
  try {
    const letter = await getUserStore().updateLetter(
      r.user.uid,
      r.letter.id,
      (current) => {
        const parsed = savedLetterInput.parse({
          ...current,
          ...(body.value as object),
          type: current.type,
        });
        return { ...current, ...parsed, updatedAt: new Date().toISOString() };
      },
      condition.value,
    );
    if (!letter) return apiError('NOT_FOUND', 'Letter not found.', r.rid);
    return NextResponse.json({ letter }, noStore);
  } catch (error) {
    if (error instanceof RevisionConflict)
      return apiError('CONFLICT', error.message, r.rid, { current: error.current });
    if (error instanceof z.ZodError)
      return apiError('INVALID_INPUT', error.issues[0]?.message ?? 'Invalid letter.', r.rid);
    throw error;
  }
}

async function handleDELETE(req: Request, ctx: LetterCtx) {
  const r = await loadLetter(ctx);
  if ('error' in r) return r.error;
  const body = req.body ? await readJson(req, 1024) : { ok: true as const, value: {} };
  if (!body.ok) return apiError(body.code, 'Invalid request.', r.rid);
  const condition = parseRevisionCondition(body.value);
  if (!condition.ok)
    return apiError('INVALID_INPUT', 'expectedRevision must be a nonnegative integer.', r.rid);
  try {
    await getUserStore().deleteLetter(r.user.uid, r.letter.id, condition.value);
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
