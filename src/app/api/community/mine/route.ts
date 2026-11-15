import { NextResponse } from 'next/server';
import { apiError, requestId } from '@/lib/http';
import { currentUser } from '@/modules/identity/session';
import { getUserStore } from '@/modules/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET → the account's shared designs and where each is in review. */
export async function GET() {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in.', rid);
  const list = await getUserStore().listCommunityDesigns({ uid: user.uid, limit: 50 });
  return NextResponse.json(
    {
      designs: list
        .filter((d) => d.status !== 'removed')
        .map((d) => ({ id: d.id, name: d.name, status: d.status, reason: d.reason ?? null })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
