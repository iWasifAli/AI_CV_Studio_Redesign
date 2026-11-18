import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { NextResponse } from 'next/server';
import { apiError, requestId } from '@/lib/http';
import { runTask } from '@/modules/ai/run';
import { getBusinessConfig } from '@/modules/billing/server';
import { prepareJobAi } from '@/modules/jobs/ai-route';
import { profileDigest } from '@/modules/jobs/digest';
import { advance, MOCK_QUESTIONS } from '@/modules/jobs/mock';
import { JobUpdateError, saveGeneratedJobUpdate } from '@/modules/jobs/updates';
import { storyLines } from '@/modules/stories/schema';
import { storiesForAi } from '@/modules/stories/server';
import { noteUse } from '@/modules/metrics/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

/**
 * POST { document, answer?, restart? } → job with its mock interview moved on one turn: the first
 * question, or feedback on `answer` plus the next question (or the summary at the end).
 * Each turn is an AI action (weight in Console → AI weights).
 */
async function handlePOST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { value: cfg } = await getBusinessConfig();
  if (!cfg.features.mockInterview)
    return apiError('DISABLED', 'Mock interviews are switched off right now.', requestId(), {
      reason: 'disabled',
    });
  const p = await prepareJobAi(req, ctx, cfg.aiWeights.mockTurn);
  if ('error' in p) return p.error;
  const expectedMock = JSON.stringify(p.job.mock);
  await noteUse(p.user.uid, 'mock');
  const restart = p.body.restart === true;
  const session = restart ? undefined : p.job.mock;
  const answering = !!session?.current;
  const answer = typeof p.body.answer === 'string' ? p.body.answer.trim().slice(0, 3000) : '';
  if (answering && answer.length < 10) {
    await p.done(false);
    return apiError('INVALID_INPUT', 'Write a little more of your answer first.', p.rid);
  }
  const turns = session?.turns ?? [];
  const asked = answering ? turns.length + 1 : 0;
  const r = await runTask(
    'interview.turn',
    {
      advert: p.job.advert.slice(0, 12_000),
      jobTitle: p.job.title,
      company: p.job.company,
      profile: profileDigest(p.doc).text.slice(0, 24_000),
      transcript: turns.map((t) => ({ question: t.question, answer: t.answer })),
      question: answering ? session!.current!.question : '',
      answer: answering ? answer : '',
      remaining: Math.max(0, MOCK_QUESTIONS - asked - (answering ? 0 : 1)),
      stories: storyLines(await storiesForAi(p.user.uid)),
    },
    0,
    p.deps,
  );
  await p.done(r.ok);
  if (!r.ok)
    return apiError(
      'AI_UNAVAILABLE',
      'The interviewer couldn’t reply just now. Please try again.',
      p.rid,
    );
  const mock = advance(session, r.result, answer);
  const finished = !mock.current && mock.turns.length > 0;
  const now = new Date().toISOString();
  const saved = await saveGeneratedJobUpdate(p, (latest) => {
    if (JSON.stringify(latest.mock) !== expectedMock)
      throw new JobUpdateError(
        'CONFLICT',
        'The interview has moved on. Please reload and try again.',
      );
    return {
      ...latest,
      mock,
      ...(finished
        ? {
            mockPast: [
              {
                at: mock.startedAt,
                verdicts: mock.turns.map((t) => t.feedback.verdict),
                summary: mock.summary,
              },
              ...(latest.mockPast ?? []),
            ].slice(0, 5),
          }
        : {}),
      updatedAt: now,
    };
  });
  if ('error' in saved) return saved.error;
  const { job } = saved;
  return NextResponse.json({ job }, { headers: { 'Cache-Control': 'no-store' } });
}

export const POST = withWorkspaceOwnerErrors(handlePOST);
