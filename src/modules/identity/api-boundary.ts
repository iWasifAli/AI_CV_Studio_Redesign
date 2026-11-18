import 'server-only';
import { apiError, requestId } from '@/lib/http';
import { AuthError } from './session';

/** Keep owner assertions fail-closed when the session changes after proxy verification. */
export function withWorkspaceOwnerErrors<Args extends unknown[], Result>(
  handler: (...args: Args) => Promise<Result>,
) {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof AuthError && error.code === 'WORKSPACE_OWNER_MISMATCH')
        return apiError('FORBIDDEN', error.message, requestId(), { reason: error.code });
      throw error;
    }
  };
}
