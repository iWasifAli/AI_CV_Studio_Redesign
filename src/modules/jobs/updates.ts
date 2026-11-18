import 'server-only';
import { apiError, type ErrorCode } from '@/lib/http';
import { getUserStore } from '@/modules/store';
import { RevisionConflict } from '@/modules/store/types';
import type { Job } from './schema';

/** Reject an edit using the state read inside the atomic update. */
export class JobUpdateError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Only the edit may retry; callers keep AI, billing, metrics and email outside it. */
export async function saveJobUpdate(
  uid: string,
  id: string,
  rid: string,
  edit: (latest: Job) => Job | Promise<Job>,
  options: { expectedRevision?: unknown; generated?: unknown } = {},
): Promise<{ job: Job } | { error: Response }> {
  try {
    const expected = options.expectedRevision;
    if (
      expected !== undefined &&
      (typeof expected !== 'number' || !Number.isSafeInteger(expected) || expected < 0)
    )
      return {
        error: apiError('INVALID_INPUT', 'expectedRevision must be a nonnegative integer.', rid),
      };
    const job = await getUserStore().updateJob(
      uid,
      id,
      async (current) => {
        // Also enforce at this boundary for retrying adapters; the store checks atomically too.
        if (expected !== undefined && (current.revision ?? 0) !== expected)
          throw new RevisionConflict(current);
        return edit(current);
      },
      expected,
    );
    if (!job && expected !== undefined) throw new RevisionConflict(null);
    return job ? { job } : { error: apiError('NOT_FOUND', 'Job not found.', rid) };
  } catch (error) {
    if (error instanceof RevisionConflict)
      return {
        error: apiError('CONFLICT', error.message, rid, {
          current: error.current,
          ...(options.generated === undefined ? {} : { generated: options.generated }),
        }),
      };
    if (error instanceof JobUpdateError)
      return { error: apiError(error.code, error.message, rid, error.details) };
    throw error;
  }
}

/** Generation is complete before entering a retryable transaction. Keep rejected output as a suggestion. */
export async function saveGeneratedJobUpdate(
  p: {
    user: { uid: string };
    job: Job;
    rid: string;
    body: Record<string, unknown>;
    release?: () => Promise<void>;
    done: (ok: boolean) => Promise<void>;
  },
  edit: (latest: Job) => Job | Promise<Job>,
  extra?: Record<string, unknown>,
) {
  const release = () => (p.release ? p.release() : p.done(false));
  let result: Awaited<ReturnType<typeof saveJobUpdate>>;
  try {
    const generated = await edit(p.job);
    result = await saveJobUpdate(
      p.user.uid,
      p.job.id,
      p.rid,
      async (current) => {
        try {
          return await edit(current);
        } catch (error) {
          if (error instanceof JobUpdateError && error.code === 'CONFLICT')
            throw new RevisionConflict(current);
          throw error;
        }
      },
      {
        expectedRevision: p.body.expectedRevision ?? p.job.revision ?? 0,
        generated: extra ? { job: generated, ...extra } : generated,
      },
    );
  } catch (error) {
    // Cleanup must not replace the original persistence/edit failure.
    await release().catch(() => {});
    throw error;
  }
  if ('error' in result) await release();
  return result;
}
