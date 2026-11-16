/**
 * Preview sheet of a design through the real engine (Premium CV Template Scout):
 *
 *   npx tsx scripts/design-preview.tsx <design-id> <out-dir>
 *
 * Renders, at print size, with photos: a short CV (driver), a typical one (teacher), a long one
 * (engineer, all pages), a dense executive CV (all pages) and a sparse one. Writes one PNG per CV
 * and a contact sheet <id>-sheet.png. Also renders the ATS version of the engineer CV.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { atsSafeSpec } from '../src/modules/design/normalise';
import { migrateV1 } from '../src/modules/design/catalogue';
import { FIXTURES, PHOTO_FOR, withPhoto, type FixtureId } from '../src/modules/resume/fixtures';
import { auditExecutive } from '../src/modules/resume/stress-fixtures';
import { ops } from '../src/modules/resume/ops';
import type { DesignId, ResumeDocument } from '../src/modules/resume/schema';
import { buildDocumentHtml } from '../src/modules/templates/build-document';

const [id, out] = process.argv.slice(2) as [DesignId, string];
if (!id || !out) {
  console.error('Usage: npx tsx scripts/design-preview.tsx <design-id> <out-dir>');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const read = (f: string) => fs.readFileSync(path.join('public/fonts/cv', f)).toString('base64');
const photo = (d: ResumeDocument, k: FixtureId) => withPhoto(d, PHOTO_FOR[k] ?? 'a');
const cases: [string, ResumeDocument][] = [
  ['short', photo(FIXTURES.driver, 'driver')],
  ['typical', photo(FIXTURES.teacher, 'teacher')],
  ['long', photo(FIXTURES.engineer, 'engineer')],
  ['dense', withPhoto(auditExecutive, 'b')],
  ['sparse', FIXTURES.sparse],
];
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_EXECUTABLE_PATH ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--font-render-hinting=none'],
});
const sheet: Buffer[] = [];
async function render(label: string, doc: ResumeDocument) {
  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1.5 });
  await page.setContent(buildDocumentHtml(doc, { fonts: { kind: 'inline', read } }));
  await page.waitForFunction('window.__CV_READY__ !== undefined');
  const els = await page.$$('.cv-page');
  for (const [i, el] of els.entries()) {
    const file = path.join(out, `${id}-${label}-p${i + 1}.png`);
    await el.screenshot({ path: file as `${string}.png` });
    sheet.push(await sharp(file).resize({ width: 420 }).png().toBuffer());
  }
  await page.close();
  console.log(`${label}: ${els.length} page(s)`);
}
for (const [label, base] of cases) await render(label, ops.useDesign(base, id));
const long = ops.useDesign(photo(FIXTURES.engineer, 'engineer'), id);
const v2 = long.design.v2 ?? migrateV1(long.design);
await render('ats', ops.setSpec(long, { ...atsSafeSpec(v2), atsSafe: true }));
await browser.close();

// Contact sheet: 4 pages per row.
const metas = await Promise.all(sheet.map((b) => sharp(b).metadata()));
const w = 420;
const h = Math.max(...metas.map((m) => m.height ?? 0));
const cols = 4;
const rows = Math.ceil(sheet.length / cols);
await sharp({
  create: {
    width: cols * (w + 16) + 16,
    height: rows * (h + 16) + 16,
    channels: 3,
    background: '#e9e7e2',
  },
})
  .composite(
    sheet.map((b, i) => ({
      input: b,
      left: 16 + (i % cols) * (w + 16),
      top: 16 + Math.floor(i / cols) * (h + 16),
    })),
  )
  .png()
  .toFile(path.join(out, `${id}-sheet.png`));
console.log(`sheet: ${path.join(out, `${id}-sheet.png`)}`);
