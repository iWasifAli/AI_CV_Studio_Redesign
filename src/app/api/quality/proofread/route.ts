import { NextResponse } from 'next/server';
import { apiError, readJson, requestId } from '@/lib/http';
import { aiModels, getAiProvider } from '@/modules/ai/config';
import { sharedAiLimiter } from '@/modules/ai/limits';
import { runTask } from '@/modules/ai/run';
import { denialCode, getBusinessConfig, reserve } from '@/modules/billing/server';
import { currentUser } from '@/modules/identity/session';
import { aiBudgetSpent, track } from '@/modules/metrics/server';
import { checkIssues, proofLines, proofText } from '@/modules/quality/proofread';
import { safeParseResumeDocument } from '@/modules/resume/schema';
import { noteUse } from '@/modules/metrics/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BODY = 768 * 1024;

/**
 * POST { document } → { issues } (spec §9.3 "Proofread whole CV"). One AI action (Premium). Each
 * issue quotes words that are really in one field of the CV, with a fix for exactly those words;
 * the person accepts them one by one in the editor. Nothing is stored.
 */
export async function POST(req: Request) {
  const rid = requestId();
  const user = await currentUser();
  if (user) await noteUse(user.uid, 'proofread');
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in.', rid);
  const { value: cfg } = await getBusinessConfig();
  if (!cfg.features.proofread)
    return apiError('DISABLED', 'Proofreading is switched off right now.', rid, {
      reason: 'disabled',
    });
  const body = await readJson(req, MAX_BODY);
  if (!body.ok)
    return apiError(
      body.code,
      body.code === 'PAYLOAD_TOO_LARGE' ? 'This CV is too large.' : 'Invalid request.',
      rid,
    );
  const parsed = safeParseResumeDocument((body.value as { document?: unknown })?.document);
  if (!parsed.success) return apiError('INVALID_INPUT', 'This CV could not be read.', rid);
  const lines = proofLines(parsed.data);
  if (!lines.length)
    return NextResponse.json(
      { issues: [], checked: 0 },
      { headers: { 'Cache-Control': 'no-store' } },
    );

  const { provider } = getAiProvider();
  if (!provider) return apiError('AI_UNAVAILABLE', 'AI help is switched off right now.', rid);
  const gate = await reserve(user, 'ai.action', cfg.aiWeights.proofread);
  if (!gate.decision.ok)
    return apiError(denialCode(gate.decision), gate.decision.message, rid, {
      reason: gate.decision.reason,
    });
  if (!sharedAiLimiter()(`proofread:${user.uid}`).ok || (await aiBudgetSpent())) {
    await gate.release();
    return apiError('RATE_LIMITED', 'Too many requests. Please wait a little.', rid);
  }
  const r = await runTask('quality.proofread', { lines: proofText(lines).slice(0, 40_000) }, 0, {
    provider,
    models: aiModels(),
    timeoutMs: 50_000,
  });
  await track(r.ok ? 'ai_ok' : 'ai_fail');
  if (!r.ok) {
    await gate.release();
    await track('proofread_fail');
    return apiError(
      'AI_UNAVAILABLE',
      'The check couldn’t be done just now. Please try again.',
      rid,
    );
  }
  await track('proofread');
  return NextResponse.json(
    { issues: checkIssues(r.result.issues, lines), checked: lines.length },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
