import { json, withAdmin } from '@/modules/admin/server';
import { usageSummary } from '@/modules/design/usage-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET ?days=30 — design usage per design and theme (Admin → Designs). */
export function GET(req: Request) {
  return withAdmin(async () => {
    const days = Math.max(1, Math.min(90, Number(new URL(req.url).searchParams.get('days')) || 30));
    return json(await usageSummary(days));
  });
}
