import { apiError, clientKey, createRateLimiter, requestId } from '@/lib/http';
import { checkDesign, denialCode, getBusinessConfig, reserve } from '@/modules/billing/server';
import { pdfFilename } from '@/modules/export/filename';
import {
  checkParts,
  mergePack,
  PACK_MAX_FILE_BYTES,
  PACK_MAX_FILES,
  PACK_MAX_TOTAL_BYTES,
  PackError,
  sniff,
  zipPack,
  type PackPart,
} from '@/modules/export/pack';
import { getBrowser, readFontBase64, renderResumePdf } from '@/modules/export/pdf';
import { renderPdfFromHtml } from '@/modules/export/render';
import { currentUser } from '@/modules/identity/session';
import { buildLetterHtml } from '@/modules/letters/build-letter';
import { LETTER_TYPE } from '@/modules/letters/types';
import { noteUse } from '@/modules/metrics/activity';
import { track } from '@/modules/metrics/server';
import { safeParseResumeDocument, type ResumeDocument } from '@/modules/resume/schema';
import { getUserStore } from '@/modules/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PER_MINUTE = Number(process.env.RATE_LIMIT_PDF_PER_MINUTE ?? 10);
const limiter = createRateLimiter({ capacity: PER_MINUTE, refillPerMinute: PER_MINUTE / 2 });

/**
 * POST multipart { document, letter?: "job:<id>" | "letter:<id>", format: "pdf" | "zip",
 * files[] } → the CV, the letter and the added documents as one PDF or one ZIP. Counts as one PDF
 * download. Added files are read for this download only; nothing is stored.
 */
export async function POST(req: Request) {
  const rid = requestId();
  if (!limiter(clientKey(req)).ok)
    return apiError('RATE_LIMITED', 'Too many downloads in a short time. Please wait.', rid);
  const user = await currentUser();
  if (!user) return apiError('SIGN_IN_REQUIRED', 'Please sign in to download a pack.', rid);
  const { value: cfg } = await getBusinessConfig();
  if (!cfg.features.pack)
    return apiError('DISABLED', 'Application packs are switched off right now.', rid, {
      reason: 'disabled',
    });
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > PACK_MAX_TOTAL_BYTES + 1024 * 1024)
    return apiError('PAYLOAD_TOO_LARGE', 'The files are too large together (15 MB at most).', rid);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError('INVALID_INPUT', 'Invalid request.', rid);
  }
  let parsedDoc: ReturnType<typeof safeParseResumeDocument> | null = null;
  try {
    parsedDoc = safeParseResumeDocument(JSON.parse(String(form.get('document') ?? '')));
  } catch {
    parsedDoc = null;
  }
  if (!parsedDoc?.success) return apiError('INVALID_INPUT', 'This CV could not be read.', rid);
  const doc: ResumeDocument = parsedDoc.data;
  const format = form.get('format') === 'zip' ? 'zip' : 'pdf';

  // The letter, if one was chosen: a job's letter or a saved letter.
  const letterRef = String(form.get('letter') ?? '');
  let letterHtml: string | null = null;
  const m = /^(job|letter):([\w-]{1,64})$/.exec(letterRef);
  if (letterRef && !m) return apiError('INVALID_INPUT', 'Invalid letter.', rid);
  if (m) {
    const store = getUserStore();
    const fonts = { fonts: { kind: 'inline' as const, read: readFontBase64 } };
    if (m[1] === 'job') {
      const job = await store.getJob(user.uid, m[2]!);
      if (!job?.letter?.paragraphs.some((p) => p.trim()))
        return apiError('NOT_FOUND', 'Write the letter first.', rid);
      letterHtml = buildLetterHtml(doc, job.letter, job, fonts);
    } else {
      const letter = await store.getLetter(user.uid, m[2]!);
      if (!letter?.paragraphs.some((p) => p.trim()))
        return apiError('NOT_FOUND', 'Write the letter first.', rid);
      letterHtml = buildLetterHtml(
        doc,
        letter,
        {
          title: '',
          company: '',
          to: letter.to,
          subject: letter.subject,
          kind: LETTER_TYPE[letter.type].title.toLowerCase(),
          form: LETTER_TYPE[letter.type].form,
        },
        fonts,
      );
    }
  }

  // Added documents: real PDFs and pictures only, checked by their content.
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length > PACK_MAX_FILES)
    return apiError('INVALID_INPUT', `Add at most ${PACK_MAX_FILES} documents.`, rid);
  const added: PackPart[] = [];
  let total = 0;
  for (const f of files) {
    if (f.size > PACK_MAX_FILE_BYTES)
      return apiError('INVALID_INPUT', `“${f.name}” is larger than 5 MB.`, rid);
    total += f.size;
    if (total > PACK_MAX_TOTAL_BYTES)
      return apiError('INVALID_INPUT', 'The documents are too large together (15 MB).', rid);
    const bytes = new Uint8Array(await f.arrayBuffer());
    const kind = sniff(bytes);
    if (!kind) return apiError('INVALID_INPUT', `“${f.name}” isn’t a PDF, PNG or JPG file.`, rid);
    added.push({ name: f.name.slice(0, 120) || 'Document', kind, bytes });
  }
  try {
    await checkParts(added);
  } catch (e) {
    if (e instanceof PackError) return apiError('INVALID_INPUT', e.message, rid);
    throw e;
  }

  const design = await checkDesign(user, doc.design);
  if (!design.ok)
    return apiError(denialCode(design), design.message, rid, { reason: design.reason });
  const gate = await reserve(user, 'pdf.download');
  if (!gate.decision.ok)
    return apiError(denialCode(gate.decision), gate.decision.message, rid, {
      reason: gate.decision.reason,
    });
  await noteUse(user.uid, 'pack');

  try {
    const name = pdfFilename(doc.basics.name).replace(/\.pdf$/i, '');
    const cv = await renderResumePdf(doc);
    const parts: PackPart[] = [{ name: `${name}.pdf`, kind: 'pdf', bytes: cv.pdf }];
    if (letterHtml) {
      const { pdf } = await renderPdfFromHtml(await getBrowser(), letterHtml);
      parts.push({
        name: `${name.replace(/-?CV$/i, '')}-Cover-Letter.pdf`,
        kind: 'pdf',
        bytes: pdf,
      });
    }
    parts.push(...added);
    const base = `${name.replace(/-?CV$/i, '') || 'My'}-Application`;
    const out =
      format === 'zip'
        ? await zipPack(parts)
        : await mergePack(parts, `${doc.basics.name || 'Application'} — application`);
    await track(format === 'zip' ? 'pack_zip' : 'pack_pdf');
    return new Response(Buffer.from(out), {
      headers: {
        'Content-Type': format === 'zip' ? 'application/zip' : 'application/pdf',
        'Content-Disposition': `attachment; filename="${base}.${format}"`,
        'Cache-Control': 'no-store',
        'x-request-id': rid,
      },
    });
  } catch (e) {
    await gate.release();
    await track('pack_fail');
    if (e instanceof PackError) return apiError('INVALID_INPUT', e.message, rid);
    console.error(
      JSON.stringify({ level: 'error', route: '/api/pack', rid, message: (e as Error).message }),
    );
    return apiError('RENDER_FAILED', 'We couldn’t put your pack together just now.', rid);
  }
}
