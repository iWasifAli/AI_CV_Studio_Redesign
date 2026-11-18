import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { parseRevisionCondition, RevisionConflict } from '@/modules/store/types';
import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/http';
import { aiModels, getAiProvider } from '@/modules/ai/config';
import { sharedAiLimiter } from '@/modules/ai/limits';
import { runTask } from '@/modules/ai/run';
import { denialCode, getBusinessConfig, reserve } from '@/modules/billing/server';
import { profileDigest } from '@/modules/jobs/digest';
import type { SavedLetter } from '@/modules/letters/schema';
import { loadLetter, type LetterCtx } from '@/modules/letters/server';
import { withDefaults, LETTER_TYPE, missingAnswers } from '@/modules/letters/types';
import { aiBudgetSpent, track } from '@/modules/metrics/server';
import { resumeDocument } from '@/modules/resume/schema';
import { getUserStore } from '@/modules/store';
import { storyLines } from '@/modules/stories/schema';
import { storiesForAi } from '@/modules/stories/server';
import { noteUse } from '@/modules/metrics/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

/**
 * POST { document, tone } → the letter with an AI draft (task letter.generic). Facts may come only
 * from the person's answers and the CV; anything else is marked for them to fill in.
 */
async function handlePOST(req: Request, ctx: LetterCtx) {
  const r = await loadLetter(ctx);
  if ('error' in r) return r.error;
  const { rid, user, letter } = r;
  await noteUse(user.uid, 'letters');
  const type = LETTER_TYPE[letter.type];
  const missing = missingAnswers(type, letter.answers);
  if (missing.length) return apiError('INVALID_INPUT', `Answer “${missing[0]!.label}” first.`, rid);
  const raw = await readJson(req, 256 * 1024);
  if (!raw.ok) return apiError(raw.code, 'Invalid request.', rid);
  const body = (raw.value ?? {}) as Record<string, unknown>;
  const condition = parseRevisionCondition(body);
  if (!condition.ok)
    return apiError('INVALID_INPUT', 'expectedRevision must be a nonnegative integer.', rid);
  if (condition.value !== undefined && condition.value !== (letter.revision ?? 0))
    return apiError('CONFLICT', 'This letter changed.', rid, { current: letter });
  const doc = resumeDocument.safeParse(body.document);
  if (!doc.success) return apiError('INVALID_INPUT', 'Choose a CV to use.', rid);
  const tone = body.tone === 'formal' ? 'formal' : 'warm';
  if (!(await getBusinessConfig()).value.features.letters)
    return apiError('DISABLED', 'Letters are switched off right now.', rid, { reason: 'disabled' });
  const { provider } = getAiProvider();
  if (!provider) return apiError('AI_UNAVAILABLE', 'AI help is switched off right now.', rid);
  const gate = await reserve(user, 'ai.action');
  if (!gate.decision.ok)
    return apiError(denialCode(gate.decision), gate.decision.message, rid, {
      reason: gate.decision.reason,
    });
  const limit = sharedAiLimiter()(`letter:${user.uid}`);
  if (!limit.ok || (await aiBudgetSpent())) {
    await gate.release();
    return apiError('RATE_LIMITED', 'Too many AI requests. Please wait a little.', rid);
  }
  const result = await runTask(
    'letter.generic',
    {
      typeTitle: type.title,
      notes: type.notes,
      form: type.form ?? 'letter',
      answers: type.questions
        .map((q) => ({
          question: q.label,
          answer: (withDefaults(type, letter.answers)[q.id] ?? '').trim(),
        }))
        .filter((a) => a.answer),
      to: letter.to.filter(Boolean).join(', '),
      name: doc.data.basics.name,
      profile: profileDigest(doc.data).text.slice(0, 24_000),
      tone,
      stories: storyLines(await storiesForAi(user.uid)),
    },
    0,
    { provider, models: aiModels(), timeoutMs: 60_000 },
  );
  await track(result.ok ? 'ai_ok' : 'ai_fail');
  if (!result.ok) {
    await gate.release();
    return apiError('AI_UNAVAILABLE', 'We couldn’t write a draft just now. Please try again.', rid);
  }
  const next: SavedLetter = {
    ...letter,
    ...result.result,
    tone,
    documentId: doc.data.id,
    updatedAt: new Date().toISOString(),
  };
  try {
    const saved = await getUserStore().updateLetter(
      user.uid,
      letter.id,
      () => next,
      condition.value ?? letter.revision ?? 0,
    );
    if (!saved) throw new RevisionConflict(null);
    next.revision = saved.revision;
  } catch (error) {
    await gate.release();
    if (error instanceof RevisionConflict)
      return apiError('CONFLICT', error.message, rid, { current: error.current, generated: next });
    throw error;
  }
  return NextResponse.json(
    { letter: next, findings: result.findings.length },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const POST = withWorkspaceOwnerErrors(handlePOST);
