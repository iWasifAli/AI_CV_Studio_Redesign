import { NextResponse } from 'next/server';
import { apiError, readJson, requestId } from '@/lib/http';
import { aiModels, getAiProvider } from '@/modules/ai/config';
import { sharedAiLimiter } from '@/modules/ai/limits';
import { runTask } from '@/modules/ai/run';
import { denialCode, getBusinessConfig, includes, reserve } from '@/modules/billing/server';
import { currentUser } from '@/modules/identity/session';
import { aiBudgetSpent, track } from '@/modules/metrics/server';
import { cleanAnswers, hasNumber } from '@/modules/quality/quantify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/**
 * Quantify prompts (spec §9.3), Premium:
 * POST { mode: 'ask', point, job } → { questions } — one AI action.
 * POST { mode: 'insert', point, job, answers } → { point } — the answers worked into the point,
 * fact-guarded; part of the same action, so not counted again (like AI Designer refines).
 */
export async function POST(req: Request) {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in.', rid);
  const { value: cfg } = await getBusinessConfig();
  if (!cfg.features.quantify)
    return apiError('DISABLED', 'This is switched off right now.', rid, { reason: 'disabled' });
  const body = await readJson(req, 8 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', rid);
  const b = (body.value ?? {}) as Record<string, unknown>;
  const mode = b.mode === 'insert' ? 'insert' : b.mode === 'ask' ? 'ask' : null;
  const point = clean(b.point, 600);
  const job = clean(b.job, 300);
  const answers = cleanAnswers(b.answers);
  if (!mode || point.length < 5) return apiError('INVALID_INPUT', 'Invalid request.', rid);
  if (mode === 'ask' && hasNumber(point))
    return apiError('INVALID_INPUT', 'This point already has a number.', rid);
  if (mode === 'insert' && !answers.length)
    return apiError('INVALID_INPUT', 'Answer at least one question.', rid);

  const { provider } = getAiProvider();
  if (!provider) return apiError('AI_UNAVAILABLE', 'AI help is switched off right now.', rid);
  let release = async () => {};
  if (mode === 'ask') {
    const gate = await reserve(user, 'ai.action', cfg.aiWeights.quantify);
    if (!gate.decision.ok)
      return apiError(denialCode(gate.decision), gate.decision.message, rid, {
        reason: gate.decision.reason,
      });
    release = gate.release;
  } else {
    const d = await includes(user, 'ai.action');
    if (!d.ok) return apiError(denialCode(d), d.message, rid, { reason: d.reason });
  }
  if (!sharedAiLimiter()(`quantify:${user.uid}`).ok || (await aiBudgetSpent())) {
    await release();
    return apiError('RATE_LIMITED', 'Too many requests. Please wait a little.', rid);
  }
  const r = await runTask('write.quantify', { mode, point, job, answers }, 0, {
    provider,
    models: aiModels(),
    timeoutMs: 25_000,
  });
  await track(r.ok ? 'ai_ok' : 'ai_fail');
  if (!r.ok || (mode === 'ask' ? !r.result.questions.length : !r.result.point)) {
    await release();
    return apiError('AI_UNAVAILABLE', 'That didn’t work just now. Please try again.', rid);
  }
  await track(mode === 'ask' ? 'quantify_ask' : 'quantify_add');
  return NextResponse.json(
    mode === 'ask' ? { questions: r.result.questions } : { point: r.result.point },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
