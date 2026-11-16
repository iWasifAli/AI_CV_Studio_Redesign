/**
 * Design authoring kit (catalogue Part F). A design is one data file; this command does the rest.
 *
 *   npm run design:new -- <id> [--like <design>]   create src/modules/design/data/<id>.json from an
 *                                                 existing design, then check it
 *   npm run design:check -- <id>                  check a design file after editing it
 *   npm run design:remove -- <id>                 remove a design file and its thumbnail
 *
 * The check: reads the file strictly, registers it, renders its thumbnail, runs the catalogue and
 * composition gates on it, records its render fingerprint and runs the distinctness check against
 * the live designs. Prints pass or fail per step; exit code 1 on any failure.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { readDataDesign } from '../src/modules/design/data-design';
import { DESIGNS, DESIGN_META, SPEC_DESIGNS } from '../src/modules/design/designs';
import { GRAPHIC_BLOCKS } from '../src/modules/design/spec';
import { DATA_DESIGN_IDS } from '../src/modules/design/data';
import { BAND, COVER, RAIL, SPOT } from '../src/modules/templates/graphic/catalog';
import { GRAPHIC_META } from '../src/modules/templates/graphic/meta';
import type { DesignId } from '../src/modules/resume/schema';

const DIR = 'src/modules/design/data';
const [cmd, id, ...rest] = process.argv.slice(2);
const like = rest[rest.indexOf('--like') + 1];
const file = (x: string) => path.join(DIR, `${x}.json`);
const today = new Date().toISOString().slice(0, 10);

function run(label: string, args: string[], env: Record<string, string> = {}) {
  process.stdout.write(`… ${label}\n`);
  const r = spawnSync('npx', ['tsx', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${r.stdout}${r.stderr}`.trim();
  return { ok: r.status === 0, out };
}

/** A starting file from an existing design: its look as spec data, its words as placeholders. */
function starter(newId: string, from: DesignId) {
  const meta = DESIGN_META[from];
  if (!meta) throw new Error(`No design "${from}".`);
  const g = (GRAPHIC_META as Record<string, { accent: string }>)[from];
  let spec: unknown = SPEC_DESIGNS[from as keyof typeof SPEC_DESIGNS];
  if (g) {
    const s = SPOT.find((c) => c.id === from);
    const b = BAND.find((c) => c.id === from);
    const r = RAIL.find((c) => c.id === from);
    const c = COVER.find((x) => x.id === from);
    const tones = (x: { ink: string; soft: string }) => ({ ink: x.ink, soft: x.soft });
    const graphic = s
      ? {
          layout: 'poster',
          frame: s.portrait,
          art: s.art,
          numbers: s.numbers,
          marker: s.marker,
          skills: s.skills,
          side: s.side,
          caps: s.caps,
          stop: s.stop,
          ...tones(s),
        }
      : b
        ? {
            layout: 'band',
            frame: b.photo,
            art: b.art,
            numbers: b.numbers,
            marker: b.marker,
            skills: b.skills,
            caps: b.caps,
            stop: b.stop,
            end: b.end,
            railMm: b.railMm,
            ...tones(b),
          }
        : r
          ? {
              layout: 'rail',
              frame: r.photo,
              art: r.panel,
              ornament: r.ornament,
              nameStyle: r.nameStyle,
              marker: r.marker,
              skills: r.skills,
              railMm: r.railMm,
              ...tones(r),
            }
          : {
              layout: 'cover',
              frame: c!.frame,
              art: c!.pattern,
              marker: c!.marker,
              skills: c!.skills,
              side: c!.side,
              caps: c!.caps,
              stop: c!.stop,
              ...tones(c!),
            };
    spec = {
      layout: { type: 'sidebar-right' },
      placement: { side: ['skills', 'languages', 'certifications', 'licences', 'awards'] },
      header: { style: 'band', photo: { show: true } },
      color: { mode: 'accent' },
      graphic,
    };
  }
  if (!spec) throw new Error(`"${from}" is hand-written; start from a spec or graphic design.`);
  return {
    id: newId,
    name:
      newId.charAt(0).toUpperCase() +
      newId.slice(1).replace(/-./g, (m) => ` ${m[1]!.toUpperCase()}`),
    style: `New design (from ${meta.name})`,
    description: `Describe in one or two sentences what makes this design different from ${meta.name}.`,
    family: meta.family,
    fontPair: meta.fontPair,
    accent: g?.accent ?? '#1e4f7a',
    fit: meta.fit,
    photo: meta.photo,
    tags: ['creative'],
    fallback: DESIGN_META[from] && !(from in SPEC_DESIGNS) ? from : 'clarity',
    status: 'draft',
    addedAt: today,
    spec,
  };
}

function check(x: string): boolean {
  const results: [string, boolean, string][] = [];
  const raw = JSON.parse(fs.readFileSync(file(x), 'utf8')) as Record<string, unknown>;
  const r = readDataDesign(raw);
  results.push(['design file is valid', r.ok, r.ok ? '' : r.errors.join('\n')]);
  if (!r.ok) return report(x, results);
  if (r.file.id !== x) results.push(['id matches the file name', false, `${r.file.id} ≠ ${x}`]);
  const clash = DESIGNS.find((d) => d.name === r.file.name && d.id !== x);
  results.push(['name is unique', !clash, clash ? `"${r.file.name}" is ${clash.id}` : '']);
  const builtIn =
    DESIGNS.some((d) => d.id === x) && !(DATA_DESIGN_IDS as readonly string[]).includes(x);
  results.push(['id is new', !builtIn, builtIn ? `${x} is a built-in design` : '']);
  if (r.spec.graphic && r.file.family !== 'graphic')
    results.push([
      'graphic layouts are in the Graphic family',
      false,
      `family is ${r.file.family}`,
    ]);
  const blocks = r.spec.graphic ? GRAPHIC_BLOCKS[r.spec.graphic.layout] : null;
  if (blocks)
    results.push([`layout "${r.spec.graphic!.layout}" with its building blocks`, true, '']);
  if (/^Describe in one or two sentences/.test(r.file.description))
    results.push(['description written', false, 'Replace the placeholder description.']);

  const idx = spawnSync('node', ['scripts/design-index.mjs'], { encoding: 'utf8' });
  results.push(['registered', idx.status === 0, `${idx.stdout}${idx.stderr}`.trim()]);
  const thumb = run('thumbnail', ['scripts/template-thumbnails.tsx', x]);
  results.push([
    'thumbnail rendered',
    thumb.ok && fs.existsSync(`public/templates/${x}.webp`),
    thumb.out.slice(-400),
  ]);
  const cat = run('catalogue gates', ['scripts/catalogue-gates.tsx', x]);
  results.push([
    'catalogue gates (parity, top third, read-back, text order)',
    cat.ok,
    cat.ok ? '' : cat.out.slice(-1500),
  ]);
  const comp = run('composition gates', ['scripts/composition-gates.tsx', x]);
  results.push([
    'composition gates (words, art, fill, splits)',
    comp.ok,
    comp.ok ? '' : comp.out.slice(-1500),
  ]);
  const fp = run('render fingerprint', [
    '-e',
    `import fs from 'node:fs';import {createHash} from 'node:crypto';
import {FIXTURES,PHOTO_FOR,withPhoto} from './src/modules/resume/fixtures';
import {ops} from './src/modules/resume/ops';
import {buildDocumentHtml} from './src/modules/templates/build-document';
const f='src/modules/design/render-hashes.json';const j=JSON.parse(fs.readFileSync(f,'utf8'));
for (const s of ['driver','teacher','engineer']) {const d=ops.useDesign(withPhoto(FIXTURES[s],PHOTO_FOR[s]??'a'),'${x}' as never);
j['${x}/'+s]=createHash('sha256').update(buildDocumentHtml(d,{fonts:{kind:'url',baseUrl:'http://x'}})).digest('hex').slice(0,16);}
fs.writeFileSync(f,JSON.stringify(j,null,2)+'\\n');`,
  ]);
  results.push(['render fingerprint recorded', fp.ok, fp.ok ? '' : fp.out.slice(-600)]);
  const dist = run('distinctness', ['scripts/distinctness.tsx', '--with', x]);
  results.push([
    'distinct from every live design',
    dist.ok,
    dist.out.split('\n').slice(0, 7).join('\n'),
  ]);
  return report(x, results);
}

function report(x: string, results: [string, boolean, string][]): boolean {
  console.log(`\nDesign "${x}"`);
  for (const [label, ok, detail] of results) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (detail && (!ok || label.startsWith('distinct')))
      console.log(detail.replace(/^/gm, '        '));
  }
  const ok = results.every(([, o]) => o);
  console.log(
    ok
      ? `\nPASS — ${x} is ready. It starts as a draft: switch it live in Admin → Designs.`
      : `\nFAIL — fix the steps above and run: npm run design:check -- ${x}`,
  );
  return ok;
}

if (!id || !/^[a-z][a-z0-9-]{1,23}$/.test(id)) {
  console.error(
    'Usage: npm run design:new -- <id> [--like <design>] | design:check -- <id> | design:remove -- <id>',
  );
  process.exit(2);
}
if (cmd === 'new') {
  if (fs.existsSync(file(id))) {
    console.error(`${file(id)} exists already; use design:check.`);
    process.exit(2);
  }
  fs.writeFileSync(
    file(id),
    JSON.stringify(starter(id, (like ?? 'clarity') as DesignId), null, 2) + '\n',
  );
  console.log(
    `Created ${file(id)}. Edit its words and look, then run: npm run design:check -- ${id}`,
  );
  process.exit(check(id) ? 0 : 1);
} else if (cmd === 'check') {
  process.exit(check(id) ? 0 : 1);
} else if (cmd === 'remove') {
  fs.rmSync(file(id), { force: true });
  fs.rmSync(`public/templates/${id}.webp`, { force: true });
  const f = 'src/modules/design/render-hashes.json';
  const j = JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, string>;
  for (const k of Object.keys(j)) if (k.startsWith(`${id}/`)) delete j[k];
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
  spawnSync('node', ['scripts/design-index.mjs'], { stdio: 'inherit' });
  console.log(`Removed ${id}.`);
} else {
  console.error(`Unknown command "${cmd}".`);
  process.exit(2);
}
