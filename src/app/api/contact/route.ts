import { NextResponse } from 'next/server';
import { getBusinessConfig } from '@/modules/billing/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The public contact details for the site footer (the same ones shown on the Contact page). */
export async function GET() {
  const { email, phone } = (await getBusinessConfig()).value.support;
  return NextResponse.json(
    { email, phone },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
  );
}
