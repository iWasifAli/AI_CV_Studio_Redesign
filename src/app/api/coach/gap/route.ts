import { NextResponse } from 'next/server';
import { apiError, readJson, requestId } from '@/lib/http';
import { aiModels, getAiProvider } from '@/modules/ai/config';
import { sharedAiLimiter } from '@/modules/ai/limits';
import { runTask } from '@/modules/ai/run';
import { denialCode, getBusinessConfig, reserve } from '@/modules/billing/server';
import { currentUser } from '@/modules/identity/session';
import { noteUse } from '@/modules/metrics/activity';
import { aiBudgetSpent, track } from '@/modules/metrics/server';
import { GAP_REASONS } from '@/modules/quality/gaps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/**
 * Explain a gap (spec §9.3): POST { reason, answer, length, after, before } → { cvLine,
 * interviewLine }, worded from the person's own answer. One AI action.
 */
export async function POST(req: Request) {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in.', rid);
  await noteUse(user.uid, 'coach');
  const { value: cfg } = await getBusinessConfig();
  if (!cfg.features.gapCoach)
    return apiError('DISABLED', 'This is switched off right now.', rid, { reason: 'disabled' });
  const body = await readJson(req, 4 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', rid);
  const b = (body.value ?? {}) as Record<string, unknown>;
  const reason = GAP_REASONS.find(([k]) => k === b.reason);
  if (!reason) return apiError('INVALID_INPUT', 'Choose what the break was for.', rid);
  const input = {
    reason: reason[1],
    answer: clean(b.answer, 400),
    length: clean(b.length, 40) || 'some months',
    after: clean(b.after, 200),
    before: clean(b.before, 200),
  };

  const { provider } = getAiProvider();
  if (!provider) return apiError('AI_UNAVAILABLE', 'AI help is switched off right now.', rid);
  const gate = await reserve(user, 'ai.action', cfg.aiWeights.gap);
  if (!gate.decision.ok)
    return apiError(denialCode(gate.decision), gate.decision.message, rid, {
      reason: gate.decision.reason,
    });
  if (!sharedAiLimiter()(`gap:${user.uid}`).ok || (await aiBudgetSpent())) {
    await gate.release();
    return apiError('RATE_LIMITED', 'Too many requests. Please wait a little.', rid);
  }
  const r = await runTask('coach.gap', input, 0, {
    provider,
    models: aiModels(),
    timeoutMs: 20_000,
  });
  await track(r.ok ? 'ai_ok' : 'ai_fail');
  if (!r.ok) {
    await gate.release();
    return apiError('AI_UNAVAILABLE', 'That didn’t work just now. Please try again.', rid);
  }
  await track('gap_explain');
  return NextResponse.json(
    { cvLine: r.result.cvLine, interviewLine: r.result.interviewLine, findings: r.findings.length },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
