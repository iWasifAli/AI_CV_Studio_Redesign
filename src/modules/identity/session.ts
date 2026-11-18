import 'server-only';
import { cookies, headers } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';

/**
 * Server sessions (docs/product/studio-master-plan.md §4.1). The browser signs in with Firebase
 * Auth and exchanges a fresh ID token for an httpOnly session cookie. Every API route that needs
 * a user calls requireUser(); nothing trusts client-side state.
 *
 * Cookie name `__session`: the only cookie Firebase's CDN forwards to the server.
 */
export const SESSION_COOKIE = '__session';
const SESSION_DAYS = 14;

export type SessionUser = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  admin: boolean;
};

export class AuthError extends Error {
  constructor(
    readonly code: 'NO_SESSION' | 'INVALID_TOKEN' | 'STALE_LOGIN' | 'WORKSPACE_OWNER_MISMATCH',
    message: string,
  ) {
    super(message);
  }
}

/** Exchange a fresh Firebase ID token for a session cookie value. */
export async function createSessionCookie(idToken: string) {
  const auth = adminAuth();
  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken, true);
  } catch {
    throw new AuthError('INVALID_TOKEN', 'Sign-in could not be verified.');
  }
  // Only a recent sign-in may create a long session.
  if (Date.now() / 1000 - decoded.auth_time > 5 * 60)
    throw new AuthError('STALE_LOGIN', 'Please sign in again.');
  const expiresIn = SESSION_DAYS * 24 * 60 * 60 * 1000;
  const value = await auth.createSessionCookie(idToken, { expiresIn });
  return {
    value,
    maxAge: expiresIn / 1000,
    uid: decoded.uid,
    email: decoded.email ?? null,
    name: (decoded.name as string | undefined) ?? null,
    admin: decoded.admin === true,
  };
}

export async function setSessionCookie(value: string, maxAge: number) {
  (await cookies()).set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

/** The signed-in user, or null. Checks revocation so signed-out/disabled users are rejected. */
export async function verifiedSessionUser(value: string | undefined): Promise<SessionUser | null> {
  if (!value) return null;
  try {
    const d = await adminAuth().verifySessionCookie(value, true);
    return {
      uid: d.uid,
      email: d.email ?? null,
      emailVerified: Boolean(d.email_verified),
      name: (d.name as string | undefined) ?? null,
      picture: (d.picture as string | undefined) ?? null,
      admin: d.admin === true,
    };
  } catch {
    return null;
  }
}

/** An assertion only: the header never supplies identity or grants guest permissions. */
export function assertWorkspaceOwner(owner: string | null, user: SessionUser | null) {
  if (owner !== null && (!user || owner !== user.uid))
    throw new AuthError(
      'WORKSPACE_OWNER_MISMATCH',
      'The workspace belongs to a different or expired session.',
    );
}

export async function currentUser(): Promise<SessionUser | null> {
  const user = await verifiedSessionUser((await cookies()).get(SESSION_COOKIE)?.value);
  // Deliberately outside the verification catch: a mismatch must never become a guest request.
  assertWorkspaceOwner((await headers()).get('X-Workspace-Owner'), user);
  return user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new AuthError('NO_SESSION', 'Please sign in.');
  return user;
}

/** Sign out everywhere: revoke refresh tokens so all session cookies stop working. */
export async function revokeSessions(uid: string) {
  await adminAuth().revokeRefreshTokens(uid);
}
