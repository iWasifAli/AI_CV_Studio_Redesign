import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { parseRevisionCondition, RevisionConflict } from '@/modules/store/types';
import { NextResponse } from 'next/server';
import { apiError, readJson, requestId } from '@/lib/http';
import { aiModels, getAiProvider } from '@/modules/ai/config';
import { sharedAiLimiter } from '@/modules/ai/limits';
import { runTask } from '@/modules/ai/run';
import { denialCode, getBusinessConfig, reserve } from '@/modules/billing/server';
import { append, checkActions, HISTORY_FOR_MODEL } from '@/modules/coach/thread';
import { currentUser } from '@/modules/identity/session';
import { profileDigest } from '@/modules/jobs/digest';
import { aiBudgetSpent, track } from '@/modules/metrics/server';
import { safeParseResumeDocument } from '@/modules/resume/schema';
import { getUserStore } from '@/modules/store';
import { storyLines } from '@/modules/stories/schema';
import { storiesForAi } from '@/modules/stories/server';
import { noteUse } from '@/modules/metrics/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const noStore = { headers: { 'Cache-Control': 'no-store' } };

/** GET → { thread } (null when the person hasn't talked to the coach yet). */
async function handleGET() {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in.', rid);
  return NextResponse.json(await getUserStore().getCoachState(user.uid), noStore);
}

/** DELETE → clears the conversation. */
async function handleDELETE(req?: Request) {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in.', rid);
  const body = req?.body ? await readJson(req, 1024) : { ok: true as const, value: {} };
  if (!body.ok) return apiError(body.code, 'Invalid request.', rid);
  const condition = parseRevisionCondition(body.value);
  if (!condition.ok)
    return apiError('INVALID_INPUT', 'expectedRevision must be a nonnegative integer.', rid);
  try {
    const state = await getUserStore().deleteCoachThread(user.uid, condition.value);
    return NextResponse.json({ ok: true, ...state }, noStore);
  } catch (error) {
    if (error instanceof RevisionConflict)
      return apiError('CONFLICT', error.message, rid, { current: error.current });
    throw error;
  }
}

/**
 * POST { document, message } → { thread }: one coach turn (an AI action, Premium). The coach knows
 * the chosen CV and the person's tracked jobs; the actions it offers are checked here.
 */
async function handlePOST(req: Request) {
  const rid = requestId();
  const user = await currentUser();
  if (user) await noteUse(user.uid, 'coach');
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in to talk to the coach.', rid);
  const { value: cfg } = await getBusinessConfig();
  if (!cfg.features.coach)
    return apiError('DISABLED', 'The coach is switched off right now.', rid, {
      reason: 'disabled',
    });
  const raw = await readJson(req, 512 * 1024);
  if (!raw.ok) return apiError(raw.code, 'Invalid request.', rid);
  const body = (raw.value ?? {}) as { document?: unknown; message?: unknown };
  const condition = parseRevisionCondition(raw.value);
  if (!condition.ok)
    return apiError('INVALID_INPUT', 'expectedRevision must be a nonnegative integer.', rid);
  const state = await getUserStore().getCoachState(user.uid);
  if (condition.value !== undefined && condition.value !== state.revision)
    return apiError('CONFLICT', 'The conversation changed.', rid, { current: state });
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
  if (!message) return apiError('INVALID_INPUT', 'Type a question for the coach.', rid);
  const doc = safeParseResumeDocument(body.document);
  if (!doc.success) return apiError('INVALID_INPUT', 'Choose a CV for the coach to read.', rid);
  const { provider } = getAiProvider();
  if (!provider) return apiError('AI_UNAVAILABLE', 'AI help is switched off right now.', rid);
  const gate = await reserve(user, 'ai.action', cfg.aiWeights.coachTurn);
  if (!gate.decision.ok)
    return apiError(denialCode(gate.decision), gate.decision.message, rid, {
      reason: gate.decision.reason,
    });
  if (!sharedAiLimiter()(`coach:${user.uid}`).ok || (await aiBudgetSpent())) {
    await gate.release();
    return apiError('RATE_LIMITED', 'Too many messages. Please wait a little.', rid);
  }
  const store = getUserStore();
  const thread = state.thread;
  const [jobs, stories] = await Promise.all([store.listJobs(user.uid), storiesForAi(user.uid)]);
  const open = jobs.filter((j) => j.stage !== 'closed').slice(0, 30);
  const r = await runTask(
    'coach.chat',
    {
      profile: profileDigest(doc.data).text.slice(0, 24_000),
      jobs: open.map((j) => `${j.id} | ${j.title} | ${j.company || '-'} | ${j.stage}`).join('\n'),
      history: (thread?.messages ?? [])
        .slice(-HISTORY_FOR_MODEL)
        .map((m) => ({ role: m.role, text: m.text.slice(0, 4000) })),
      message,
      stories: storyLines(stories),
    },
    0,
    { provider, models: aiModels(), timeoutMs: 45_000 },
  );
  await track(r.ok ? 'ai_ok' : 'ai_fail');
  if (!r.ok) {
    await gate.release();
    return apiError('AI_UNAVAILABLE', 'The coach couldn’t reply just now. Please try again.', rid);
  }
  const next = append(thread, message, {
    reply: r.result.reply,
    actions: checkActions(r.result.actions, new Set(open.map((j) => j.id))),
  });
  try {
    const saved = await store.putCoachThread(user.uid, next, condition.value ?? state.revision);
    return NextResponse.json(saved, noStore);
  } catch (error) {
    await gate.release();
    if (error instanceof RevisionConflict)
      return apiError('CONFLICT', error.message, rid, { current: error.current, generated: next });
    throw error;
  }
}

export const GET = withWorkspaceOwnerErrors(handleGET);
export const DELETE = withWorkspaceOwnerErrors(handleDELETE);
export const POST = withWorkspaceOwnerErrors(handlePOST);
