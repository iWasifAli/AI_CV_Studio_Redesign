/**
 * Visual comparison of a catalogue design with a design file (catalogue Part F):
 *
 *   npx tsx scripts/design-compare.tsx <catalogue-id> <design-file.json>
 *
 * Renders every page of all six sample CVs in both, at print size, and compares them pixel by
 * pixel. Prints the share of differing pixels per sample and writes the worst pair side by side to
 * docs/catalogue/compare-<id>.png. Exit code 1 when any page differs by more than 0.5%.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';
import sharp from 'sharp';
import { inDataDesign, readDataDesign } from '../src/modules/design/data-design';
import { FIXTURES, PHOTO_FOR, withPhoto, type FixtureId } from '../src/modules/resume/fixtures';
import { ops } from '../src/modules/resume/ops';
import type { DesignId, ResumeDocument } from '../src/modules/resume/schema';
import { buildDocumentHtml } from '../src/modules/templates/build-document';

const SAMPLES: FixtureId[] = ['driver', 'teacher', 'nurse', 'graduate', 'engineer', 'executive'];
const LIMIT = 0.005;
const read = (f: string) => fs.readFileSync(path.join('public/fonts/cv', f)).toString('base64');

async function pages(browser: Browser, doc: ResumeDocument): Promise<Buffer[]> {
  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
  await page.setContent(buildDocumentHtml(doc, { fonts: { kind: 'inline', read } }));
  await page.waitForFunction('window.__CV_READY__ !== undefined');
  const out: Buffer[] = [];
  for (const el of await page.$$('.cv-page'))
    out.push(Buffer.from(await el.screenshot({ type: 'png' })));
  await page.close();
  return out;
}

async function diff(a: Buffer, b: Buffer): Promise<number> {
  const [x, y] = await Promise.all(
    [a, b].map((p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })),
  );
  if (x!.info.width !== y!.info.width || x!.info.height !== y!.info.height) return 1;
  let n = 0;
  const px = x!.info.width * x!.info.height;
  for (let i = 0; i < x!.data.length; i += 4) {
    const d =
      Math.abs(x!.data[i]! - y!.data[i]!) +
      Math.abs(x!.data[i + 1]! - y!.data[i + 1]!) +
      Math.abs(x!.data[i + 2]! - y!.data[i + 2]!);
    if (d > 24) n++;
  }
  return n / px;
}

export async function compare(id: DesignId, file: string) {
  const r = readDataDesign(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_EXECUTABLE_PATH ?? '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--font-render-hinting=none'],
  });
  let worst: { sample: string; page: number; share: number; a: Buffer; b: Buffer } = {
    sample: '',
    page: 0,
    share: -1,
    a: Buffer.alloc(0),
    b: Buffer.alloc(0),
  };
  const rows: string[] = [];
  let ok = true;
  for (const s of SAMPLES) {
    const base = r.file.photo ? withPhoto(FIXTURES[s], PHOTO_FOR[s] ?? 'a') : FIXTURES[s];
    const [pa, pb] = await Promise.all([
      pages(browser, ops.useDesign(base, id)),
      pages(browser, inDataDesign(base, r.file, r.spec)),
    ]);
    if (pa.length !== pb.length) {
      rows.push(`${s}: page count ${pa.length} vs ${pb.length}`);
      ok = false;
      continue;
    }
    const shares = await Promise.all(pa.map((p, i) => diff(p, pb[i]!)));
    shares.forEach((share, i) => {
      if (share > worst.share) worst = { sample: s, page: i + 1, share, a: pa[i]!, b: pb[i]! };
      if (share > LIMIT) ok = false;
    });
    rows.push(
      `${s}: ${pa.length} page(s), differing pixels ${shares.map((x) => `${(x * 100).toFixed(3)}%`).join(', ')}`,
    );
  }
  await browser.close();
  if (worst.a.length) {
    const [ma, mb] = await Promise.all([sharp(worst.a).metadata(), sharp(worst.b).metadata()]);
    fs.mkdirSync('docs/catalogue', { recursive: true });
    await sharp({
      create: {
        width: ma.width! + mb.width! + 20,
        height: Math.max(ma.height!, mb.height!),
        channels: 3,
        background: '#ffffff',
      },
    })
      .composite([
        { input: worst.a, left: 0, top: 0 },
        { input: worst.b, left: ma.width! + 20, top: 0 },
      ])
      .png()
      .toBuffer()
      .then((b) =>
        sharp(b).resize({ width: 1000 }).png().toFile(`docs/catalogue/compare-${id}.png`),
      );
  }
  return { ok, rows, worst: { sample: worst.sample, page: worst.page, share: worst.share } };
}

if (process.argv[1]?.endsWith('design-compare.tsx')) {
  const [id, file] = process.argv.slice(2);
  if (!id || !file) {
    console.error('Usage: npx tsx scripts/design-compare.tsx <catalogue-id> <design-file.json>');
    process.exit(2);
  }
  const res = await compare(id as DesignId, file);
  for (const r of res.rows) console.log(r);
  console.log(
    `${res.ok ? 'PASS' : 'FAIL'}: worst ${res.worst.sample} page ${res.worst.page}, ${(res.worst.share * 100).toFixed(3)}% of pixels differ (limit ${LIMIT * 100}%)`,
  );
  process.exit(res.ok ? 0 : 1);
}
