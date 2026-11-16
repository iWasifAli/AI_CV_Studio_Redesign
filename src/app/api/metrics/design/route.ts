import { NextResponse } from 'next/server';
import { apiError, clientKey, createRateLimiter, readJson, requestId } from '@/lib/http';
import { CLIENT_EVENTS, type UsageNote } from '@/modules/design/usage';
import { recordUsage } from '@/modules/design/usage-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limiter = createRateLimiter({ capacity: 20, refillPerMinute: 20 });
const MAX = 80;

/**
 * POST { events: [{ id, kind, theme? }] } — design usage from the browser, batched (one request per
 * page visit for "shown"). Counts only; nothing about the person or their CV.
 */
export async function POST(req: Request) {
  const rid = requestId();
  if (!limiter(clientKey(req)).ok) return apiError('RATE_LIMITED', 'Slow down.', rid);
  const body = await readJson(req, 8 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', rid);
  const events = (body.value as { events?: unknown })?.events;
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX)
    return apiError('INVALID_INPUT', 'Invalid events.', rid);
  const notes: UsageNote[] = [];
  for (const e of events as Record<string, unknown>[]) {
    if (
      typeof e?.id !== 'string' ||
      typeof e.kind !== 'string' ||
      !(CLIENT_EVENTS as readonly string[]).includes(e.kind)
    )
      return apiError('INVALID_INPUT', 'Invalid events.', rid);
    notes.push({
      id: e.id,
      kind: e.kind as UsageNote['kind'],
      ...(typeof e.theme === 'string' ? { theme: e.theme } : {}),
    });
  }
  await recordUsage(notes);
  return new NextResponse(null, { status: 204 });
}
