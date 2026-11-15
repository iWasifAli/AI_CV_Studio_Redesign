import { NextResponse } from 'next/server';
import { apiError, readJson, requestId } from '@/lib/http';
import { aiModels, getAiProvider } from '@/modules/ai/config';
import { sharedAiLimiter } from '@/modules/ai/limits';
import { runTask } from '@/modules/ai/run';
import { denialCode, getBusinessConfig, reserve } from '@/modules/billing/server';
import { currentUser } from '@/modules/identity/session';
import { profileDigest } from '@/modules/jobs/digest';
import { noteUse } from '@/modules/metrics/activity';
import { aiBudgetSpent, track } from '@/modules/metrics/server';
import { safeParseResumeDocument } from '@/modules/resume/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST { document, interests? } → { paths } — roles reachable from the CV (spec §10.3). */
export async function POST(req: Request) {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in.', rid);
  await noteUse(user.uid, 'skills');
  const { value: cfg } = await getBusinessConfig();
  if (!cfg.features.careerPaths)
    return apiError('DISABLED', 'Career paths are switched off right now.', rid, {
      reason: 'disabled',
    });
  const body = await readJson(req, 256 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', rid);
  const b = (body.value ?? {}) as { document?: unknown; interests?: unknown };
  const parsed = safeParseResumeDocument(b.document);
  if (!parsed.success) return apiError('INVALID_INPUT', 'Choose a CV to use.', rid);
  const profile = profileDigest(parsed.data).text.slice(0, 24_000);
  if (profile.length < 40)
    return apiError('INVALID_INPUT', 'Add some experience to your CV first.', rid);
  const interests =
    typeof b.interests === 'string' ? b.interests.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  const { provider } = getAiProvider();
  if (!provider) return apiError('AI_UNAVAILABLE', 'AI help is switched off right now.', rid);
  const gate = await reserve(user, 'ai.action', cfg.aiWeights.paths);
  if (!gate.decision.ok)
    return apiError(denialCode(gate.decision), gate.decision.message, rid, {
      reason: gate.decision.reason,
    });
  if (!sharedAiLimiter()(`paths:${user.uid}`).ok || (await aiBudgetSpent())) {
    await gate.release();
    return apiError('RATE_LIMITED', 'Too many requests. Please wait a little.', rid);
  }
  const r = await runTask('career.paths', { profile, interests }, 0, {
    provider,
    models: aiModels(),
    timeoutMs: 45_000,
  });
  await track(r.ok ? 'ai_ok' : 'ai_fail');
  if (!r.ok) {
    await gate.release();
    return apiError('AI_UNAVAILABLE', 'That didn’t work just now. Please try again.', rid);
  }
  await track('paths_ok');
  return NextResponse.json(
    { paths: r.result.paths, findings: r.findings.length },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
