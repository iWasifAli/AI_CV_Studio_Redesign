import type { JobBoardMove, JobBoardState } from '@/modules/jobs/board';
import { JOB_STAGES, type Job, type JobStage } from '@/modules/jobs/schema';

/** Keep acknowledged additions made during a refresh, without reviving older deleted jobs. */
export function reconcileBoardRefreshJobs(server: Job[], atStart: Job[], current: Job[]) {
  const observed = new Set([...server, ...atStart].map((job) => job.id));
  return [...current.filter((job) => !observed.has(job.id)), ...server];
}

/** A reopened effect/session must never revive requests from its previous lifetime. */
export function createBoardRequestScope() {
  let generation = 0;
  let active = false;
  return {
    open() {
      generation++;
      active = true;
    },
    close() {
      generation++;
      active = false;
    },
    capture() {
      const captured = generation;
      return () => active && captured === generation;
    },
  };
}

/** Convert every board control to the same revision-checked server intent. */
export function makeBoardMove(
  jobs: Job[],
  board: JobBoardState,
  jobId: string,
  toStage: JobStage,
  beforeId: string | null,
): JobBoardMove | null {
  const job = jobs.find((item) => item.id === jobId);
  if (!job || beforeId === jobId) return null;
  const target = board.columns[toStage];
  if (beforeId !== null && !target.includes(beforeId)) return null;
  const next = target.filter((id) => id !== jobId);
  next.splice(beforeId === null ? next.length : next.indexOf(beforeId), 0, jobId);
  if (job.stage === toStage) {
    const visible = new Set(jobs.map((item) => item.id));
    const currentIds = target.filter((id) => visible.has(id));
    const nextIds = next.filter((id) => visible.has(id));
    if (nextIds.every((id, index) => id === currentIds[index])) return null;
  }
  return {
    jobId,
    fromStage: job.stage,
    toStage,
    beforeId,
    revision: board.revision,
    expectedJobUpdatedAt: job.updatedAt,
  };
}

/** A display-only snapshot: never manufacture history, timestamps or a new revision. */
export function previewBoardMove(jobs: Job[], board: JobBoardState, move: JobBoardMove) {
  const columns = { ...board.columns };
  for (const stage of JOB_STAGES) {
    columns[stage] = columns[stage].filter((id) => id !== move.jobId);
  }
  const target = columns[move.toStage];
  target.splice(
    move.beforeId === null ? target.length : target.indexOf(move.beforeId),
    0,
    move.jobId,
  );
  return {
    board: { ...board, columns },
    jobs: jobs.map((job) =>
      job.id === move.jobId && job.stage !== move.toStage ? { ...job, stage: move.toStage } : job,
    ),
  };
}

/** Undefined means a boundary; null means append after the last visible card. */
export function reorderAnchor(ids: string[], jobId: string, direction: 'up' | 'down') {
  const index = ids.indexOf(jobId);
  if (index < 0) return undefined;
  if (direction === 'up') return index > 0 ? ids[index - 1] : undefined;
  return index < ids.length - 1 ? (ids[index + 2] ?? null) : undefined;
}

export type BoardPosition = { stage: JobStage; beforeId: string | null };

/** Keyboard navigation moves between insertion gaps, including wholly empty lanes. */
export function keyboardBoardPosition(
  columns: Record<JobStage, string[]>,
  jobId: string,
  position: BoardPosition,
  key: string,
): BoardPosition | null {
  const ids = columns[position.stage].filter((id) => id !== jobId);
  const index = position.beforeId === null ? ids.length : ids.indexOf(position.beforeId);
  if (index < 0) return null;
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const next = index + (key === 'ArrowUp' ? -1 : 1);
    if (next < 0 || next > ids.length) return null;
    return { stage: position.stage, beforeId: ids[next] ?? null };
  }
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  const stage = JOB_STAGES[JOB_STAGES.indexOf(position.stage) + (key === 'ArrowLeft' ? -1 : 1)];
  if (!stage) return null;
  const target = columns[stage].filter((id) => id !== jobId);
  return { stage, beforeId: target[Math.min(index, target.length)] ?? null };
}
