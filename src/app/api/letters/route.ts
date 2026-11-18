import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalJson } from '@/modules/store/types';
import { NextResponse } from 'next/server';
import { apiError, readJson, requestId } from '@/lib/http';
import { getBusinessConfig } from '@/modules/billing/server';
import { currentUser } from '@/modules/identity/session';
import { MAX_LETTERS, savedLetterInput, type SavedLetter } from '@/modules/letters/schema';
import { getUserStore } from '@/modules/store';
import { noteUse } from '@/modules/metrics/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { headers: { 'Cache-Control': 'no-store' } };

/** GET → { letters, max } (the letter library of the signed-in person). */
async function handleGET() {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in to keep letters.', rid);
  const letters = await getUserStore().listLetters(user.uid);
  return NextResponse.json({ letters, max: MAX_LETTERS }, noStore);
}

/** POST SavedLetterInput → the new letter. Writing letters yourself is free; AI drafts are not. */
async function handlePOST(req: Request) {
  const rid = requestId();
  const user = await currentUser();
  if (user) await noteUse(user.uid, 'letters');
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in to keep letters.', rid);
  const body = await readJson(req, 64 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', rid);
  const parsed = savedLetterInput.safeParse(body.value);
  if (!parsed.success)
    return apiError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid letter.', rid);
  const { value: cfg } = await getBusinessConfig();
  if (!cfg.features.letters || cfg.content.hiddenLetterTypes.includes(parsed.data.type))
    return apiError('DISABLED', 'This letter type isn’t available right now.', rid, {
      reason: 'disabled',
    });
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
  const now = new Date().toISOString();
  const letter: SavedLetter = {
    ...parsed.data,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  const result = await store.createLetter(user.uid, letter, MAX_LETTERS, receipt);
  if (!result.ok) {
    if (result.reason === 'conflict')
      return apiError(
        'CONFLICT',
        'This creation key was already used with a different payload or its result was deleted.',
        rid,
        { current: result.current },
      );
    return apiError(
      'LIMIT_REACHED',
      `You can keep up to ${MAX_LETTERS} letters. Delete one you no longer need.`,
      rid,
      { reason: 'limit', limit: MAX_LETTERS },
    );
  }
  return NextResponse.json({ letter: result.value }, noStore);
}

export const GET = withWorkspaceOwnerErrors(handleGET);
export const POST = withWorkspaceOwnerErrors(handlePOST);
