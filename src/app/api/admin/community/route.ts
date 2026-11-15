import { json, withAdmin } from '@/modules/admin/server';
import { COMMUNITY_STATUS, type CommunityStatus } from '@/modules/community/types';
import { parseSpec } from '@/modules/design/spec';
import { getUserStore } from '@/modules/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET ?status=pending|approved|rejected → the review queue (oldest waiting first). */
export function GET(req: Request) {
  return withAdmin(async () => {
    const asked = new URL(req.url).searchParams.get('status');
    const status: CommunityStatus = (COMMUNITY_STATUS as readonly string[]).includes(asked ?? '')
      ? (asked as CommunityStatus)
      : 'pending';
    const list = await getUserStore().listCommunityDesigns({ status, limit: 200 });
    if (status === 'pending') list.reverse();
    return json({
      status,
      designs: list.map((d) => ({ ...d, uid: undefined, spec: parseSpec(d.spec) })),
    });
  });
}
