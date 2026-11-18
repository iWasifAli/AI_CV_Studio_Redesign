import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/http';
import { storyInput, type Story } from '@/modules/stories/schema';
import { loadStory, type StoryCtx } from '@/modules/stories/server';
import { getUserStore } from '@/modules/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { headers: { 'Cache-Control': 'no-store' } };

async function handleGET(_req: Request, ctx: StoryCtx) {
  const r = await loadStory(ctx);
  if ('error' in r) return r.error;
  return NextResponse.json({ story: r.story }, noStore);
}

/** PUT partial StoryInput → the updated story (where it came from stays). */
async function handlePUT(req: Request, ctx: StoryCtx) {
  const r = await loadStory(ctx);
  if ('error' in r) return r.error;
  const body = await readJson(req, 32 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', r.rid);
  const parsed = storyInput.safeParse({
    ...r.story,
    ...(body.value as object),
    source: r.story.source,
  });
  if (!parsed.success)
    return apiError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid story.', r.rid);
  const story: Story = {
    ...parsed.data,
    id: r.story.id,
    createdAt: r.story.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await getUserStore().putStory(r.user.uid, story);
  return NextResponse.json({ story }, noStore);
}

async function handleDELETE(_req: Request, ctx: StoryCtx) {
  const r = await loadStory(ctx);
  if ('error' in r) return r.error;
  await getUserStore().deleteStory(r.user.uid, r.story.id);
  return NextResponse.json({ ok: true }, noStore);
}

export const GET = withWorkspaceOwnerErrors(handleGET);
export const PUT = withWorkspaceOwnerErrors(handlePUT);
export const DELETE = withWorkspaceOwnerErrors(handleDELETE);
