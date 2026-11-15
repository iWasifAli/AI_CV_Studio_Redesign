import { NextResponse } from 'next/server';
import { apiError, readJson, requestId } from '@/lib/http';
import { aiModels, getAiProvider } from '@/modules/ai/config';
import { sharedAiLimiter } from '@/modules/ai/limits';
import { runTask } from '@/modules/ai/run';
import { denialCode, getBusinessConfig, reserve } from '@/modules/billing/server';
import { currentUser } from '@/modules/identity/session';
import { noteUse } from '@/modules/metrics/activity';
import { aiBudgetSpent, track } from '@/modules/metrics/server';
import { safeParseResumeDocument } from '@/modules/resume/schema';
import { collectPieces, languageOf, lock, lockedWords, unlock } from '@/modules/translate/document';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST { document, language } → { pieces: [{ id, original, text, kept }] } — the CV's words in
 * the new language for the person to review. Names, employers, places, numbers, dates, emails
 * and links never reach the model (locked tokens); a piece whose tokens came back wrong keeps
 * its original text (`kept`). Counts as `aiWeights.translate` AI actions.
 */
export async function POST(req: Request) {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in.', rid);
  await noteUse(user.uid, 'translate');
  const { value: cfg } = await getBusinessConfig();
  if (!cfg.features.translate)
    return apiError('DISABLED', 'Translation is switched off right now.', rid, {
      reason: 'disabled',
    });
  const body = await readJson(req, 512 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', rid);
  const b = (body.value ?? {}) as { document?: unknown; language?: unknown };
  const parsed = safeParseResumeDocument(b.document);
  if (!parsed.success) return apiError('INVALID_INPUT', 'This CV could not be read.', rid);
  const lang = languageOf(String(b.language ?? ''));
  if (!lang) return apiError('INVALID_INPUT', 'Choose a language.', rid);
  const doc = parsed.data;
  const pieces = collectPieces(doc).slice(0, 300);
  if (!pieces.length) return apiError('INVALID_INPUT', 'There’s nothing to translate yet.', rid);
  const words = lockedWords(doc);
  const locked = pieces.map((p) => ({ ...p, ...lock(p.text, words) }));

  const { provider } = getAiProvider();
  if (!provider) return apiError('AI_UNAVAILABLE', 'AI help is switched off right now.', rid);
  const gate = await reserve(user, 'ai.action', cfg.aiWeights.translate);
  if (!gate.decision.ok)
    return apiError(denialCode(gate.decision), gate.decision.message, rid, {
      reason: gate.decision.reason,
    });
  if (!sharedAiLimiter()(`translate:${user.uid}`).ok || (await aiBudgetSpent())) {
    await gate.release();
    return apiError('RATE_LIMITED', 'Too many requests. Please wait a little.', rid);
  }
  const r = await runTask(
    'translate.document',
    { language: lang[1], pieces: locked.map((p) => ({ id: p.id, text: p.text })) },
    0,
    { provider, models: aiModels(), timeoutMs: 100_000 },
  );
  await track(r.ok ? 'ai_ok' : 'ai_fail');
  if (!r.ok) {
    await gate.release();
    return apiError(
      'AI_UNAVAILABLE',
      'The translation didn’t work just now. Please try again.',
      rid,
    );
  }
  const got = new Map(r.result.pieces.map((p) => [p.id, p.text]));
  let kept = 0;
  const out = locked.map((p) => {
    const t = got.get(p.id);
    const back = t ? unlock(t, p.tokens) : null;
    if (back === null) kept++;
    return {
      id: p.id,
      original: pieces.find((x) => x.id === p.id)!.text,
      text: back ?? '',
      kept: back === null,
    };
  });
  await track('translate_ok');
  if (kept) await track('translate_kept', kept);
  return NextResponse.json(
    { language: lang[0], pieces: out },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
