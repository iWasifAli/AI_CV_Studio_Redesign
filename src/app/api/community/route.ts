import { NextResponse } from 'next/server';
import { apiError, readJson, requestId } from '@/lib/http';
import { getBusinessConfig } from '@/modules/billing/server';
import { cleanText, textProblem } from '@/modules/community/check';
import { publicDesign } from '@/modules/community/public';
import { MAX_PENDING, type CommunityDesign } from '@/modules/community/types';
import { normalise } from '@/modules/design/normalise';
import { parseSpec } from '@/modules/design/spec';
import { currentUser } from '@/modules/identity/session';
import { track } from '@/modules/metrics/server';
import { getUserStore } from '@/modules/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET → approved community designs (featured first). Empty while the switch is off. */
export async function GET() {
  const { value: cfg } = await getBusinessConfig();
  if (!cfg.features.community) return NextResponse.json({ designs: [] });
  const list = await getUserStore().listCommunityDesigns({ status: 'approved', limit: 100 });
  list.sort((a, b) => Number(b.featured) - Number(a.featured));
  return NextResponse.json(
    { designs: list.map(publicDesign) },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}

/**
 * POST { designId, name, description, credit } → shares one of the account's saved designs for
 * review. Nothing is shown to others until the owner approves it in the Console.
 */
export async function POST(req: Request) {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in to share a design.', rid);
  const { value: cfg } = await getBusinessConfig();
  if (!cfg.features.community)
    return apiError('DISABLED', 'Sharing designs isn’t open yet.', rid, { reason: 'disabled' });
  const body = await readJson(req, 4 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', rid);
  const b = (body.value ?? {}) as Record<string, unknown>;
  const name = cleanText(b.name, 40);
  const description = cleanText(b.description, 200);
  if (name.length < 3) return apiError('INVALID_INPUT', 'Give the design a name.', rid);
  const problem = textProblem('The name', name) ?? textProblem('The description', description);
  if (problem) return apiError('INVALID_INPUT', problem, rid);

  const store = getUserStore();
  const saved = (await store.listDesigns(user.uid)).find((d) => d.id === b.designId);
  if (!saved) return apiError('NOT_FOUND', 'Save the design first, then share it.', rid);
  const mine = await store.listCommunityDesigns({ uid: user.uid, limit: 100 });
  if (mine.filter((d) => d.status === 'pending').length >= MAX_PENDING)
    return apiError(
      'LIMIT_REACHED',
      `You have ${MAX_PENDING} designs waiting for review. Please wait for those first.`,
      rid,
    );
  if (
    mine.some(
      (d) => d.status !== 'removed' && JSON.stringify(d.spec) === JSON.stringify(saved.spec),
    )
  )
    return apiError('CONFLICT', 'You’ve already shared this design.', rid);

  const n = normalise(parseSpec(saved.spec));
  const firstName = (user.name ?? '').trim().split(/\s+/)[0]?.slice(0, 30) ?? '';
  const design: CommunityDesign = {
    id: crypto.randomUUID(),
    uid: user.uid,
    credit: b.credit === true && firstName ? firstName : null,
    name,
    description,
    spec: n.spec,
    status: 'pending',
    checks: { notes: n.unmet.map(String).slice(0, 10) },
    featured: false,
    createdAt: new Date().toISOString(),
  };
  await store.putCommunityDesign(design);
  await track('community_submit');
  return NextResponse.json({ design: { id: design.id, status: design.status } }, { status: 201 });
}
