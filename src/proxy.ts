import { NextRequest, NextResponse } from 'next/server';
import { apiError, requestId } from '@/lib/http';
import {
  assertWorkspaceOwner,
  AuthError,
  SESSION_COOKIE,
  verifiedSessionUser,
} from '@/modules/identity/session';

/** Fail closed before guest-capable API handlers; assertions never establish authentication. */
export async function proxy(req: NextRequest) {
  const owner = req.headers.get('X-Workspace-Owner');
  if (owner === null) return NextResponse.next();
  const user = await verifiedSessionUser(req.cookies.get(SESSION_COOKIE)?.value);
  try {
    assertWorkspaceOwner(owner, user);
    return NextResponse.next();
  } catch (error) {
    if (error instanceof AuthError)
      return apiError('FORBIDDEN', error.message, requestId(), { reason: error.code });
    throw error;
  }
}
export const config = { matcher: '/api/:path*' };
