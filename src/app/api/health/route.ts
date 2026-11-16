import { NextResponse } from 'next/server';
import { aiMode } from '@/modules/ai/config';
import { chromiumAvailable } from '@/modules/export/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const chromium = (await chromiumAvailable()) ? 'ok' : 'unavailable';
  const mode = aiMode();
  const ai = mode === 'gemini' ? 'configured' : mode;
  return NextResponse.json(
    {
      status: 'ok',
      // The built commit when the build had git; otherwise the hosting revision (Cloud Run sets
      // K_REVISION on every running server), so production never reports "dev" (gap audit G-17).
      version:
        process.env.BUILD_SHA ||
        process.env.GIT_SHA ||
        process.env.K_REVISION ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        'dev',
      checks: { chromium, ai },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
