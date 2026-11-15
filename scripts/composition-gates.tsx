/**
 * Composition gates (independent audit, 15 Nov 2026): what overflow checks miss and people see.
 * Every catalogue design × the audit's long executive CV (Letter and A4), the audit's graduate CV
 * and the extreme fixture, in production Chromium print mode:
 *  - no word broken mid-word (only at hyphens, @, dots and slashes);
 *  - no text drawn over other text, no decoration under text;
 *  - pages filled: every page but the last at least MIN_FILL % (tallest column), the last at
 *    least MIN_LAST %.
 *
 * Usage: npx tsx scripts/composition-gates.tsx [id,id,…] [--report]   (exit 1 on any failure)
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { DESIGNS } from '../src/modules/design/designs';
import { extreme } from '../src/modules/resume/fixtures';
import { ops } from '../src/modules/resume/ops';
import type { ResumeDocument } from '../src/modules/resume/schema';
import { auditExecutive, auditGraduate } from '../src/modules/resume/stress-fixtures';
import { buildDocumentHtml } from '../src/modules/templates/build-document';

const MIN_FILL = Number(process.env.MIN_FILL ?? 80);
const MIN_LAST = Number(process.env.MIN_LAST ?? 20);
const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith('--'))?.split(',');
const report = args.includes('--report');
const read = (f: string) => fs.readFileSync(path.join('public/fonts/cv', f)).toString('base64');
const probe = fs.readFileSync(path.join('scripts/lib/composition-probe.js'), 'utf8');
const paper = (d: ResumeDocument, size: 'A4' | 'Letter'): ResumeDocument => ({
  ...d,
  design: { ...d.design, pageSize: size },
});
const CASES: [string, ResumeDocument][] = [
  ['exec·Letter', paper(auditExecutive, 'Letter')],
  ['exec·A4', paper(auditExecutive, 'A4')],
  ['graduate', paper(auditGraduate, 'A4')],
  ['extreme', extreme],
];

type Probe = {
  pages: number;
  broken: { page: number; word: string; at: number }[];
  overlaps: { page: number; a: string; b: string }[];
  deco: { page: number; cls: string; text: string }[];
  fill: Record<string, number>[];
};

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_EXECUTABLE_PATH ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--font-render-hinting=none'],
});
const fails: string[] = [];
const rows: string[] = [];
for (const meta of DESIGNS) {
  if (only && !only.includes(meta.id)) continue;
  for (const [name, src] of CASES) {
    const doc = ops.useDesign(src, meta.id);
    const page = await browser.newPage();
    await page.emulateMediaType('print');
    await page.setContent(buildDocumentHtml(doc, { fonts: { kind: 'inline', read } }), {
      waitUntil: 'load',
    });
    await page.waitForFunction('window.__CV_READY__ !== undefined');
    const r = (await page.evaluate(probe)) as Probe;
    await page.close();
    const label = `${meta.id} × ${name}`;
    for (const b of r.broken.slice(0, 3))
      fails.push(`${label}: "${b.word}" broken mid-word on page ${b.page}`);
    for (const o of r.overlaps.slice(0, 2))
      fails.push(`${label}: text over text on page ${o.page} ("${o.a}" / "${o.b}")`);
    for (const d of r.deco.slice(0, 2))
      fails.push(`${label}: decoration ${d.cls} under "${d.text}" on page ${d.page}`);
    const tallest = r.fill.map((c) => Math.max(0, ...Object.values(c)));
    tallest.forEach((f, i) => {
      const last = i === tallest.length - 1;
      if (!last && f < MIN_FILL) fails.push(`${label}: page ${i + 1} only ${f}% full`);
      if (last && tallest.length > 1 && f < MIN_LAST)
        fails.push(`${label}: last page only ${f}% full`);
    });
    rows.push(`${label.padEnd(34)} ${r.pages}p  fill ${tallest.join('/')}`);
  }
  if (!report) process.stdout.write('.');
}
await browser.close();
if (report) console.log(rows.join('\n'));
console.log(`\n${fails.length} failures`);
for (const f of fails) console.log('FAIL', f);
if (fails.length) process.exit(1);
