import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { checkParts, mergePack, numbered, PackError, safeName, sniff, zipPack } from './pack';

const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwHwyBDAYGAG7uB/kFb4G1AAAAAElFTkSuQmCC',
  ),
  (c) => c.charCodeAt(0),
);

async function pdf(pages: number) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage();
  return d.save();
}

describe('pack', () => {
  it('knows files by their content', async () => {
    expect(sniff(await pdf(1))).toBe('pdf');
    expect(sniff(PNG)).toBe('png');
    expect(sniff(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('jpg');
    expect(sniff(new TextEncoder().encode('<html>hello</html>'))).toBeNull();
  });

  it('makes safe, numbered names', () => {
    expect(safeName('../../etc/pass wd.exe', 'pdf')).toBe('etc-pass-wd.pdf');
    expect(safeName('Zeugnis Müller.PDF', 'pdf')).toBe('Zeugnis-Müller.pdf');
    expect(safeName('...', 'png')).toBe('Document.png');
    expect(
      numbered([
        { name: 'cv.pdf', kind: 'pdf' },
        { name: 'cert.png', kind: 'png' },
      ]),
    ).toEqual(['01-cv.pdf', '02-cert.png']);
  });

  it('merges PDFs and pictures in order', async () => {
    const out = await mergePack(
      [
        { name: 'CV', kind: 'pdf', bytes: await pdf(2) },
        { name: 'Letter', kind: 'pdf', bytes: await pdf(1) },
        { name: 'Cert', kind: 'png', bytes: PNG },
      ],
      'Sam — application',
    );
    const d = await PDFDocument.load(out);
    expect(d.getPageCount()).toBe(4);
    expect(d.getTitle()).toBe('Sam — application');
    // The wide picture got a landscape page.
    const last = d.getPage(3);
    expect(last.getWidth()).toBeGreaterThan(last.getHeight());
  });

  it('zips every part', async () => {
    const z = await JSZip.loadAsync(
      await zipPack([
        { name: 'Sam-CV.pdf', kind: 'pdf', bytes: await pdf(1) },
        { name: 'Cert.png', kind: 'png', bytes: PNG },
      ]),
    );
    expect(Object.keys(z.files).sort()).toEqual(['01-Sam-CV.pdf', '02-Cert.png']);
  });

  it('refuses unreadable PDFs and too many pages', async () => {
    const bad = new TextEncoder().encode('%PDF-1.7 nonsense');
    await expect(checkParts([{ name: 'x.pdf', kind: 'pdf', bytes: bad }])).rejects.toThrow(
      PackError,
    );
    await expect(
      checkParts([{ name: 'big.pdf', kind: 'pdf', bytes: await pdf(61) }]),
    ).rejects.toThrow(/60 pages/);
    await expect(checkParts([{ name: 'ok.pdf', kind: 'pdf', bytes: await pdf(3) }])).resolves.toBe(
      undefined,
    );
  });
});
