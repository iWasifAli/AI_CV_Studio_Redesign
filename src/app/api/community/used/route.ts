import { NextResponse } from 'next/server';
import { clientKey, createRateLimiter } from '@/lib/http';
import { track } from '@/modules/metrics/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limiter = createRateLimiter({ capacity: 10, refillPerMinute: 5 });

/** POST → counts one use of a community design (a number only). */
export async function POST(req: Request) {
  if (limiter(clientKey(req)).ok) await track('community_used');
  return NextResponse.json({ ok: true });
}
