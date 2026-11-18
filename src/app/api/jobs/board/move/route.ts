import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { NextResponse } from 'next/server';
import { apiError, readJson, requestId } from '@/lib/http';
import { currentUser } from '@/modules/identity/session';
import { BoardMoveError, jobBoardMove } from '@/modules/jobs/board';
import { applyJobPatch, withSent } from '@/modules/jobs/server';
import { RevisionConflict } from '@/modules/store/types';
import { getUserStore } from '@/modules/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A move changes application stage and presentation order in one commit. */
async function handlePOST(req: Request) {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in.', rid);
  const body = await readJson(req, 4 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', rid);
  const parsed = jobBoardMove.safeParse(body.value);
  if (!parsed.success) return apiError('INVALID_INPUT', 'Invalid job move.', rid);
  const started = Date.now();
  try {
    const result = await getUserStore().moveJobOnBoard(user.uid, parsed.data, async (current) => {
      const next = applyJobPatch(current, { stage: parsed.data.toStage });
      if ('error' in next) throw new BoardMoveError('INVALID_INPUT', next.error);
      return withSent(user.uid, current, next);
    });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store', 'Server-Timing': `move;dur=${Date.now() - started}` },
    });
  } catch (error) {
    if (error instanceof RevisionConflict)
      return apiError('CONFLICT', error.message, rid, { current: error.current });
    if (error instanceof BoardMoveError) return apiError(error.code, error.message, rid);
    console.error(
      JSON.stringify({
        event: 'job_board_move_failed',
        requestId: rid,
        durationMs: Date.now() - started,
      }),
    );
    return apiError('INTERNAL', 'We couldn’t move this job. Refresh the board and try again.', rid);
  }
}

export const POST = withWorkspaceOwnerErrors(handlePOST);
