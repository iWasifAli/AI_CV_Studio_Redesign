import { apiError, readJson } from '@/lib/http';
import { actor, json, withAdmin } from '@/modules/admin/server';
import { cleanText } from '@/modules/community/check';
import type { CommunityDesign } from '@/modules/community/types';
import { track } from '@/modules/metrics/server';
import { getUserStore } from '@/modules/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = ['approve', 'reject', 'feature', 'unfeature', 'remove'] as const;

/** POST { action, reason? } → approve, reject (with a reason), feature or remove a design. */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAdmin(async (admin, rid) => {
    const { id } = await ctx.params;
    const body = await readJson(req, 2048);
    if (!body.ok) return apiError(body.code, 'Invalid request.', rid);
    const b = (body.value ?? {}) as { action?: unknown; reason?: unknown };
    const action = ACTIONS.find((a) => a === b.action);
    if (!action) return apiError('INVALID_INPUT', 'Choose what to do.', rid);
    const reason = cleanText(b.reason, 300);
    if (action === 'reject' && reason.length < 3)
      return apiError('INVALID_INPUT', 'Say briefly why, so the designer knows.', rid);
    const store = getUserStore();
    const d = /^[\w-]{8,64}$/.test(id) ? await store.getCommunityDesign(id) : null;
    if (!d) return apiError('NOT_FOUND', 'That design is gone.', rid);
    const now = new Date().toISOString();
    const next: CommunityDesign =
      action === 'approve'
        ? { ...d, status: 'approved', reason: undefined, reviewedAt: now, reviewedBy: actor(admin) }
        : action === 'reject'
          ? {
              ...d,
              status: 'rejected',
              reason,
              featured: false,
              reviewedAt: now,
              reviewedBy: actor(admin),
            }
          : action === 'remove'
            ? {
                ...d,
                status: 'removed',
                featured: false,
                reviewedAt: now,
                reviewedBy: actor(admin),
              }
            : { ...d, featured: action === 'feature' && d.status === 'approved' };
    // Firestore rejects undefined values.
    if (next.reason === undefined) delete next.reason;
    await store.putCommunityDesign(next);
    if (action === 'approve') await track('community_approved');
    await store.writeAudit({
      at: now,
      by: actor(admin),
      action: `community.${action}`,
      target: d.id,
      detail: { name: d.name, ...(reason ? { reason } : {}) },
    });
    return json({ ok: true, status: next.status, featured: next.featured });
  });
}
