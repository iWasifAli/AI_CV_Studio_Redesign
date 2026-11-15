/**
 * Graphic designs QA: renders designs with (1) a sample matching the owner's reference collection
 * (fictional "Jordan Lee"; the reference portrait is used only here, locally, never shipped) and
 * (2) the realistic fixtures, to PDF + PNG at 96 dpi (same pixel size as the reference previews).
 * Usage: npx tsx scripts/graphic-shots.tsx outDir ids [fixtures] (PORTRAIT=/path/to/jpg)
 */
import { specOf } from '@/modules/design/designer';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { FIXTURES, PHOTO_FOR, withPhoto, type FixtureId } from '../src/modules/resume/fixtures';
import { ops } from '../src/modules/resume/ops';
import type { DesignId, ResumeDocument } from '../src/modules/resume/schema';
import { buildDocumentHtml } from '../src/modules/templates/build-document';
import { renderPdfFromHtml } from '../src/modules/export/render';

const outDir = process.argv[2] ?? 'artifacts/graphic';
const ids = (process.argv[3] ?? 'neon').split(',') as DesignId[];
const fixtures = (process.argv[4] ?? 'sample').split(',');
const read = (f: string) => fs.readFileSync(path.join('public/fonts/cv', f)).toString('base64');

function sample(): ResumeDocument {
  const d = structuredClone(FIXTURES.graduate) as ResumeDocument;
  const p = process.env.PORTRAIT;
  d.id = 'sample-jordan';
  d.basics = {
    ...d.basics,
    name: 'Jordan Lee',
    headline: 'Educator',
    email: 'jordan.lee@example.com',
    phone: '+1 (555) 014-2026',
    location: 'New York, USA',
    links: [{ id: 'l1', label: '', url: 'portfolio.example.com' }],
    summary:
      'Multidisciplinary creative professional with 9+ years of experience shaping meaningful digital experiences. I combine clear strategy, impactful visual storytelling, and evidence-led design to turn ambitious ideas into exceptional outcomes.',
    stats: [
      { id: 'k1', value: '09+', label: 'Years experience' },
      { id: 'k2', value: '32%', label: 'Conversion uplift' },
      { id: 'k3', value: '14', label: 'Products launched' },
    ],
    photo: p ? `data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}` : '',
  };
  const job = (
    role: string,
    org: string,
    start: string,
    end: string,
    b: string,
    current = false,
  ) => ({
    id: role,
    role,
    organization: org,
    location: '',
    start,
    end,
    current,
    bullets: [b],
  });
  d.sections = [
    {
      id: 'exp',
      kind: 'experience',
      title: 'Experience',
      hidden: false,
      items: [
        job(
          'Senior Product Designer',
          'Northstar Creative Studio',
          '2022',
          '',
          'Led visual design across multi-platform products; improved onboarding completion by 32% and built a reusable design system for seven teams.',
          true,
        ),
        job(
          'Visual Design Lead',
          'Orion Digital',
          '2019',
          '2022',
          'Directed brand experiences and mentored designers while launching accessible products for international customers.',
        ),
        job(
          'Creative Designer',
          'Fieldwork Agency',
          '2016',
          '2019',
          'Delivered identity systems, web experiences, and award-shortlisted campaign concepts.',
        ),
      ],
    },
    {
      id: 'edu',
      kind: 'education',
      title: 'Education',
      hidden: false,
      items: [
        {
          id: 'e1',
          qualification: 'BFA, Visual Communication',
          institution: 'Brighton School of Design',
          location: '',
          start: '2012',
          end: '2016',
          details: [],
        },
      ],
    },
    {
      id: 'sk',
      kind: 'skills',
      title: 'Expertise',
      hidden: false,
      items: [
        {
          id: 's1',
          label: '',
          keywords: ['Creative direction', 'UX strategy', 'Leadership', 'Visual systems'],
          levels: [5, 4, 5, 4],
        },
        { id: 's2', label: '', keywords: ['Strategy', 'Craft'], levels: [5, 4] },
      ],
    },
    {
      id: 'aw',
      kind: 'awards',
      title: 'Recognition',
      hidden: false,
      items: [
        { id: 'a1', name: 'Creative Innovation Award', issuer: '', date: '2024', detail: '' },
        { id: 'a2', name: 'Digital Experience Finalist', issuer: '', date: '2022', detail: '' },
        { id: 'a3', name: 'Emerging Design Talent', issuer: '', date: '2020', detail: '' },
      ],
    },
  ] as ResumeDocument['sections'];
  return d;
}

fs.mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_EXECUTABLE_PATH ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--font-render-hinting=none'],
});
for (const id of ids)
  for (const f of fixtures) {
    let doc =
      f === 'sample'
        ? sample()
        : process.env.NOPHOTO === '1'
          ? structuredClone(FIXTURES[f as FixtureId])
          : withPhoto(structuredClone(FIXTURES[f as FixtureId]), PHOTO_FOR[f]);
    doc = ops.useDesign(doc, id);
    // ATS=1: the plain one-column ATS version (Dual CV Export).
    if (process.env.ATS === '1') doc = ops.setSpec(doc, { ...specOf(doc.design), atsSafe: true });
    const html = buildDocumentHtml(doc, { fonts: { kind: 'inline', read } });
    const name = `${id}-${f}`;
    const { pdf, pages, overflow, nearlyFits, fitted } = await renderPdfFromHtml(browser, html);
    const pdfPath = path.join(outDir, `${name}.pdf`);
    fs.writeFileSync(pdfPath, pdf);
    const pdfPages = Number(
      /Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdfPath]).toString())?.[1],
    );
    execFileSync('pdftoppm', [
      '-png',
      '-r',
      process.env.DPI ?? '96',
      pdfPath,
      path.join(outDir, name),
    ]);
    console.log(
      `${pdfPages === pages && overflow === 0 ? 'ok  ' : 'FAIL'} ${name} pages=${pages} pdf=${pdfPages} overflow=${overflow}${nearlyFits ? ' NEARLY-EMPTY' : ''}${fitted ? ' fitted=' + fitted : ''}`,
    );
  }
await browser.close();
