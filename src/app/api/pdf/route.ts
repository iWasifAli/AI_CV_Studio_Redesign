import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { after } from 'next/server';
import { safeParseResumeDocument } from '@/modules/resume/schema';
import { pdfFilename } from '@/modules/export/filename';
import { renderResumePdf } from '@/modules/export/pdf';
import { apiError, clientKey, createRateLimiter, readJson, requestId } from '@/lib/http';
import { checkDesign, denialCode, reserve } from '@/modules/billing/server';
import { track } from '@/modules/metrics/server';
import { currentUser } from '@/modules/identity/session';
import { notePdf } from '@/modules/metrics/activity';
import { tierDesignId } from '@/modules/design/catalogue';
import { recordUsage } from '@/modules/design/usage-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BODY = 512 * 1024;
const PER_MINUTE = Number(process.env.RATE_LIMIT_PDF_PER_MINUTE ?? 10);
const limiter = createRateLimiter({ capacity: PER_MINUTE * 2, refillPerMinute: PER_MINUTE });
let inFlight = 0;
const MAX_CONCURRENT = 4;

async function handlePOST(req: Request) {
  const rid = requestId();
  const rate = limiter(clientKey(req));
  if (!rate.ok)
    return apiError(
      'RATE_LIMITED',
      'Too many downloads in a short time. Please wait a moment.',
      rid,
      undefined,
      {
        'Retry-After': String(rate.retryAfterSec),
      },
    );

  const body = await readJson(req, MAX_BODY);
  if (!body.ok)
    return apiError(
      body.code,
      body.code === 'PAYLOAD_TOO_LARGE' ? 'This CV is too large to export.' : 'Invalid request.',
      rid,
    );

  const parsed = safeParseResumeDocument((body.value as { document?: unknown })?.document);
  if (!parsed.success)
    return apiError('INVALID_INPUT', 'This CV could not be read.', rid, {
      issues: parsed.error.issues.slice(0, 10),
    });

  // Entitlement gate: design tier, then the monthly download allowance (counted on success only).
  const mark = timer();
  const user = await currentUser();
  mark('user');
  const design = await checkDesign(user, parsed.data.design);
  mark('design');
  if (!design.ok) {
    await track(design.reason === 'sign_in' ? 'pdf_denied_signin' : 'pdf_denied_premium');
    return apiError(denialCode(design), design.message, rid, { reason: design.reason });
  }
  const gate = await reserve(user, 'pdf.download');
  mark('reserve');
  if (!gate.decision.ok) {
    if (gate.decision.reason === 'sign_in') await track('pdf_denied_signin');
    if (gate.decision.reason === 'limit') await track('pdf_denied_limit');
    return apiError(denialCode(gate.decision), gate.decision.message, rid, {
      reason: gate.decision.reason,
      ...('limit' in gate.decision ? { limit: gate.decision.limit, used: gate.decision.used } : {}),
    });
  }

  if (inFlight >= MAX_CONCURRENT) {
    await gate.release();
    return apiError(
      'RATE_LIMITED',
      'We are busy creating other PDFs. Please try again in a few seconds.',
      rid,
      undefined,
      { 'Retry-After': '3' },
    );
  }

  inFlight++;
  try {
    const { pdf, pages, timing } = await renderResumePdf(parsed.data);
    mark('pdf');
    // Counting is bookkeeping: it runs after the PDF is on its way (it cost ~0.9 s before).
    after(async () => {
      await track('pdf_ok');
      const designId = tierDesignId(parsed.data.design);
      if (designId) await recordUsage([{ id: designId, kind: 'downloaded' }]);
      if (user) await notePdf(user.uid);
    });
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdfFilename(parsed.data.basics.name)}"`,
        'Cache-Control': 'no-store',
        'x-page-count': String(pages),
        'x-request-id': rid,
        // Where the time goes on the server: page build, browser start (0 when warm), rendering.
        'Server-Timing': `${mark.header()}, build;dur=${timing.build}, browser;dur=${timing.browser}, render;dur=${timing.render}`,
      },
    });
  } catch (err) {
    await gate.release();
    console.error(
      JSON.stringify({ level: 'error', route: '/api/pdf', rid, message: (err as Error).message }),
    );
    return apiError('RENDER_FAILED', 'We couldn’t create the PDF just now.', rid);
  } finally {
    inFlight--;
  }
}

/** Stage timings for the Server-Timing header (gap audit G-10: where the seconds go). */
function timer() {
  let last = Date.now();
  const parts: string[] = [];
  const mark = (name: string) => {
    const now = Date.now();
    parts.push(`${name};dur=${now - last}`);
    last = now;
  };
  mark.header = () => parts.join(', ');
  return mark;
}

export const POST = withWorkspaceOwnerErrors(handlePOST);
