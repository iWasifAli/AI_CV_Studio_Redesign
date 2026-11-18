import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, readJson } from '@/lib/http';
import { loadJobForReminders } from '@/modules/jobs/reminder-route';
import { syncQueue } from '@/modules/jobs/reminders-server';
import { MAX_REMINDERS } from '@/modules/jobs/reminders';
import { JobUpdateError, saveJobUpdate } from '@/modules/jobs/updates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { headers: { 'Cache-Control': 'no-store' } };
type Ctx = { params: Promise<{ id: string; rid: string }> };
const patch = z.object({
  done: z.boolean().optional(),
  note: z.string().trim().max(200).optional(),
});

/** PUT { done?, note? } → { job }. */
async function handlePUT(req: Request, ctx: Ctx) {
  const r = await loadJobForReminders(ctx);
  if ('error' in r) return r.error;
  const { rid } = await ctx.params;
  const body = await readJson(req, 4 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', r.rid);
  const p = patch.safeParse(body.value);
  if (!p.success) return apiError('INVALID_INPUT', 'Invalid reminder.', r.rid);
  const now = new Date().toISOString();
  const saved = await saveJobUpdate(
    r.user.uid,
    r.job.id,
    r.rid,
    (latest) => {
      const reminders = latest.reminders ?? [];
      const target = reminders.find((x) => x.id === rid);
      if (!target) throw new JobUpdateError('NOT_FOUND', 'Reminder not found.');
      if (
        p.data.done === false &&
        target.done &&
        reminders.filter((x) => !x.done).length >= MAX_REMINDERS
      )
        throw new JobUpdateError(
          'LIMIT_REACHED',
          `A job can have up to ${MAX_REMINDERS} open reminders.`,
          { reason: 'limit' },
        );
      return {
        ...latest,
        reminders: reminders.map((x) =>
          x.id === rid
            ? {
                ...x,
                ...(p.data.done !== undefined ? { done: p.data.done } : {}),
                ...(p.data.note ? { note: p.data.note } : {}),
              }
            : x,
        ),
        updatedAt: now,
      };
    },
    { expectedRevision: (body.value as { expectedRevision?: unknown } | null)?.expectedRevision },
  );
  if ('error' in saved) return saved.error;
  const { job } = saved;
  await syncQueue(r.user);
  return NextResponse.json({ job }, noStore);
}

async function handleDELETE(req: Request, ctx: Ctx) {
  const r = await loadJobForReminders(ctx);
  if ('error' in r) return r.error;
  const { rid } = await ctx.params;
  const now = new Date().toISOString();
  const body = req.body ? await readJson(req, 1024) : { ok: true as const, value: {} };
  if (!body.ok) return apiError(body.code, 'Invalid request.', r.rid);
  const saved = await saveJobUpdate(
    r.user.uid,
    r.job.id,
    r.rid,
    (latest) => ({
      ...latest,
      reminders: (latest.reminders ?? []).filter((x) => x.id !== rid),
      updatedAt: now,
    }),
    { expectedRevision: (body.value as { expectedRevision?: unknown } | null)?.expectedRevision },
  );
  if ('error' in saved) return saved.error;
  const { job } = saved;
  await syncQueue(r.user);
  return NextResponse.json({ job }, noStore);
}

export const PUT = withWorkspaceOwnerErrors(handlePUT);
export const DELETE = withWorkspaceOwnerErrors(handleDELETE);
