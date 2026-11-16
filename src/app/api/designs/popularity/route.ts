import { NextResponse } from 'next/server';
import { popularityCached } from '@/modules/design/usage-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public: 30-day popularity score per design (for the default gallery order). Counts only. */
export async function GET() {
  return NextResponse.json(
    { scores: await popularityCached() },
    { headers: { 'cache-control': 'public, max-age=300' } },
  );
}
