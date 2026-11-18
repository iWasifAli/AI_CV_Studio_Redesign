import { z } from 'zod';
import { JOB_STAGES, type Job, type JobStage } from './schema';

/** Presentation metadata, deliberately separate from application content/history. */
export type JobBoardState = { revision: number; columns: Record<JobStage, string[]> };
export type JobEditor = (current: Job) => Job | Promise<Job>;
export type JobBoardSnapshot = { jobs: Job[]; board: JobBoardState };
export type JobBoardResult = { job: Job; board: JobBoardState };

const id = z.string().regex(/^[\w-]{1,64}$/);
export const jobBoardMove = z
  .object({
    jobId: id,
    fromStage: z.enum(JOB_STAGES),
    toStage: z.enum(JOB_STAGES),
    beforeId: id.nullable(),
    revision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    expectedJobUpdatedAt: z.string().min(1).max(64),
  })
  .strict();
export type JobBoardMove = z.infer<typeof jobBoardMove>;

export class BoardMoveError extends Error {
  constructor(
    readonly code: 'CONFLICT' | 'NOT_FOUND' | 'INVALID_INPUT',
    message: string,
  ) {
    super(message);
  }
}

const emptyColumns = (): JobBoardState['columns'] => ({
  saved: [],
  applied: [],
  interview: [],
  offer: [],
  closed: [],
});

/**
 * Reconcile only jobs actually observed. listJobs is capped in Firestore: an absent ID
 * is not evidence of deletion. Unobserved placements must survive every read/move.
 */
export function resolveJobBoard(jobs: Job[], stored?: JobBoardState): JobBoardState {
  const columns = emptyColumns();
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const seen = new Set<string>();
  for (const stage of JOB_STAGES) {
    for (const jobId of stored?.columns[stage] ?? []) {
      const current = byId.get(jobId);
      if (seen.has(jobId) || (current && current.stage !== stage)) continue;
      columns[stage].push(jobId);
      seen.add(jobId);
    }
  }
  const unplaced = [...jobs].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  );
  for (const stage of JOB_STAGES) {
    columns[stage] = [
      ...unplaced.filter((job) => job.stage === stage && !seen.has(job.id)).map((job) => job.id),
      ...columns[stage],
    ];
  }
  return { revision: stored?.revision ?? 0, columns };
}

/** Validate intent against current records, and derive a single deterministic change. */
export function planJobMove(jobs: Job[], stored: JobBoardState | undefined, input: JobBoardMove) {
  const job = jobs.find((candidate) => candidate.id === input.jobId);
  if (!job) throw new BoardMoveError('NOT_FOUND', 'Job not found.');
  if (
    (stored?.revision ?? 0) !== input.revision ||
    job.stage !== input.fromStage ||
    job.updatedAt !== input.expectedJobUpdatedAt
  )
    throw new BoardMoveError('CONFLICT', 'Your board has changed. Refresh it and try again.');
  if (input.beforeId === input.jobId)
    throw new BoardMoveError('INVALID_INPUT', 'Choose a different card as the destination.');
  if (input.beforeId !== null) {
    const anchor = jobs.find((candidate) => candidate.id === input.beforeId);
    if (!anchor || anchor.stage !== input.toStage)
      throw new BoardMoveError('CONFLICT', 'Your board has changed. Refresh it and try again.');
  }
  const current = resolveJobBoard(jobs, stored);
  const columns = emptyColumns();
  for (const stage of JOB_STAGES)
    columns[stage] = current.columns[stage].filter((jobId) => jobId !== job.id);
  const target = columns[input.toStage];
  target.splice(
    input.beforeId === null ? target.length : target.indexOf(input.beforeId),
    0,
    job.id,
  );
  const stageChanged = input.toStage !== job.stage;
  const changed =
    stageChanged ||
    JOB_STAGES.some((stage) => columns[stage].join('\0') !== current.columns[stage].join('\0'));
  return {
    job,
    stageChanged,
    changed,
    board: { revision: current.revision + (changed ? 1 : 0), columns },
  };
}

/** Call only after authoritative deletion, never after a capped list read. */
export function removeFromJobBoard(board: JobBoardState, id: string): JobBoardState {
  const columns = emptyColumns();
  let changed = false;
  for (const stage of JOB_STAGES) {
    columns[stage] = board.columns[stage].filter((jobId) => jobId !== id);
    changed ||= columns[stage].length !== board.columns[stage].length;
  }
  return { revision: board.revision + (changed ? 1 : 0), columns };
}
