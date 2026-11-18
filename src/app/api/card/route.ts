import { withWorkspaceOwnerErrors } from '@/modules/identity/api-boundary';
import { apiError, clientKey, createRateLimiter, readJson, requestId } from '@/lib/http';
import { getBrowser, readFontBase64 } from '@/modules/export/pdf';
import { renderPdfFromHtml } from '@/modules/export/render';
import { pdfFilename } from '@/modules/export/filename';
import { currentUser } from '@/modules/identity/session';
import { noteUse } from '@/modules/metrics/activity';
import { businessCardHtml, qrDataUrl, type CardOptions } from '@/modules/presence/card';
import { safeParseResumeDocument } from '@/modules/resume/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const limiter = createRateLimiter({ capacity: 6, refillPerMinute: 3 });

/** POST { document, options } → a business card PDF (85 × 55 mm, front and back). Free. */
async function handlePOST(req: Request) {
  const rid = requestId();
  const user = await currentUser();
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in.', rid);
  if (!limiter(clientKey(req)).ok)
    return apiError('RATE_LIMITED', 'Too many cards in a short time. Please wait a moment.', rid);
  const body = await readJson(req, 256 * 1024);
  if (!body.ok) return apiError(body.code, 'Invalid request.', rid);
  const b = (body.value ?? {}) as { document?: unknown; options?: Partial<CardOptions> };
  const parsed = safeParseResumeDocument(b.document);
  if (!parsed.success) return apiError('INVALID_INPUT', 'This CV could not be read.', rid);
  const url = typeof b.options?.url === 'string' ? b.options.url.trim().slice(0, 200) : '';
  if (url && !/^https:\/\/[\w.-]+(\/[\w\-./?=&%#~]*)?$/i.test(url))
    return apiError('INVALID_INPUT', 'Use a full link starting with https://', rid);
  const o: CardOptions = {
    phone: b.options?.phone !== false,
    email: b.options?.email !== false,
    location: b.options?.location === true,
    links: b.options?.links === true,
    url,
  };
  await noteUse(user.uid, 'portfolio');
  try {
    const html = businessCardHtml(parsed.data, o, url ? qrDataUrl(url) : null, {
      kind: 'inline',
      read: readFontBase64,
    });
    const { pdf } = await renderPdfFromHtml(await getBrowser(), html);
    const name = pdfFilename(parsed.data.basics.name).replace(/-CV\.pdf$/, '-Business-Card.pdf');
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error(
      JSON.stringify({ level: 'error', route: '/api/card', rid, message: (e as Error).message }),
    );
    return apiError('RENDER_FAILED', 'We couldn’t create the card just now.', rid);
  }
}

export const POST = withWorkspaceOwnerErrors(handlePOST);
