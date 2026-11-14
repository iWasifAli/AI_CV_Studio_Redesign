/**
 * Application pack (spec §10.1 "Document set export"): the CV, the letter and the documents the
 * person adds (certificates, references) as one merged PDF or one ZIP. Added files are used for
 * this download only and are never stored.
 */
import JSZip from 'jszip';
import { PDFDocument, type PDFImage } from 'pdf-lib';

import { PACK_MAX_PAGES } from './pack-limits';
export * from './pack-limits';

export type PackKind = 'pdf' | 'png' | 'jpg';
export type PackPart = { name: string; kind: PackKind; bytes: Uint8Array };

export class PackError extends Error {}

/** What a file really is, from its first bytes (not its name). */
export function sniff(b: Uint8Array): PackKind | null {
  if (b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)
    return 'pdf';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  return null;
}

/** A safe file name for the ZIP: letters, digits, dashes; keeps a sensible extension. */
export function safeName(name: string, kind: PackKind): string {
  const base = name
    .replace(/\.[^.]*$/, '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'Document'}.${kind}`;
}

/** File names numbered in order (01-…, 02-…), so the ZIP sorts the way the person arranged it. */
export function numbered(parts: { name: string; kind: PackKind }[]): string[] {
  const width = String(parts.length).length < 2 ? 2 : String(parts.length).length;
  return parts.map((p, i) => `${String(i + 1).padStart(width, '0')}-${safeName(p.name, p.kind)}`);
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 36;

async function embedImage(out: PDFDocument, part: PackPart): Promise<PDFImage> {
  try {
    return part.kind === 'png' ? await out.embedPng(part.bytes) : await out.embedJpg(part.bytes);
  } catch {
    throw new PackError(`“${part.name}” couldn’t be read as a picture.`);
  }
}

/** Checks added PDFs can be read and counts their pages (before any work is charged). */
export async function checkParts(parts: PackPart[]): Promise<void> {
  let pages = 0;
  for (const p of parts) {
    if (p.kind !== 'pdf') continue;
    let count = 0;
    try {
      const doc = await PDFDocument.load(p.bytes, { updateMetadata: false });
      count = doc.getPageCount();
    } catch (e) {
      throw new PackError(
        /encrypt/i.test((e as Error).message)
          ? `“${p.name}” is password-protected. Remove the password and add it again.`
          : `“${p.name}” couldn’t be read as a PDF.`,
      );
    }
    if (count < 1) throw new PackError(`“${p.name}” has no pages.`);
    pages += count;
  }
  if (pages > PACK_MAX_PAGES)
    throw new PackError(
      `The added PDFs have ${pages} pages together. Please keep them to ${PACK_MAX_PAGES} pages.`,
    );
}

/** One PDF: every part in order; a picture becomes one A4 page, fitted inside the margins. */
export async function mergePack(parts: PackPart[], title: string): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setTitle(title);
  out.setCreator('AI CV Studio');
  out.setProducer('AI CV Studio');
  for (const p of parts) {
    if (p.kind === 'pdf') {
      let src: PDFDocument;
      try {
        src = await PDFDocument.load(p.bytes, { updateMetadata: false });
      } catch {
        throw new PackError(`“${p.name}” couldn’t be read as a PDF.`);
      }
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((pg) => out.addPage(pg));
    } else {
      const img = await embedImage(out, p);
      // Landscape pictures get a landscape page.
      const [w, h] = img.width > img.height ? [A4[1], A4[0]] : A4;
      const page = out.addPage([w, h]);
      const scale = Math.min((w - 2 * MARGIN) / img.width, (h - 2 * MARGIN) / img.height, 1);
      const dw = img.width * scale;
      const dh = img.height * scale;
      page.drawImage(img, { x: (w - dw) / 2, y: (h - dh) / 2, width: dw, height: dh });
    }
  }
  return out.save();
}

/** One ZIP: every part as its own file, numbered in order. */
export async function zipPack(parts: PackPart[]): Promise<Uint8Array> {
  const zip = new JSZip();
  numbered(parts).forEach((name, i) => zip.file(name, parts[i]!.bytes));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
