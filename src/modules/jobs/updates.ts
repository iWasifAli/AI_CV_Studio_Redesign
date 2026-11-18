import 'server-only';
import { apiError, type ErrorCode } from '@/lib/http';
import { getUserStore } from '@/modules/store';
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
): Promise<{ job: Job } | { error: Response }> {
  try {
    const job = await getUserStore().updateJob(uid, id, edit);
    return job ? { job } : { error: apiError('NOT_FOUND', 'Job not found.', rid) };
  } catch (error) {
    if (error instanceof JobUpdateError)
      return { error: apiError(error.code, error.message, rid, error.details) };
    throw error;
  }
}
