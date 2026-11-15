/**
 * Builds src/i18n/de.ts from the translation work files:
 *   i18n-work/keys-batch1.json + i18n-work/de-0NN.tsv   ("index<TAB>German")
 *   i18n-work/de-extra.tsv                               ("English<TAB>German", later additions)
 *   node scripts/i18n-compile.mjs
 */
import fs from 'node:fs';

const dir = 'i18n-work';
const keys = JSON.parse(fs.readFileSync(`${dir}/keys-batch1.json`, 'utf8'));
const out = {};
for (const f of fs
  .readdirSync(dir)
  .filter((f) => /^de-\d+\.tsv$/.test(f))
  .sort())
  for (const line of fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n')) {
    const m = /^(\d+)\t(.+)$/.exec(line);
    if (!m) continue;
    const k = keys[Number(m[1])];
    if (k && m[2].trim()) out[k] = m[2].trim();
  }
for (const f of fs
  .readdirSync(dir)
  .filter((f) => /^de-extra.*\.tsv$/.test(f))
  .sort())
  for (const line of fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n')) {
    const i = line.indexOf('\t');
    if (i > 0 && line.slice(i + 1).trim()) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
// Placeholders must survive translation.
const bad = Object.entries(out).filter(([k, v]) => {
  const ph = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
  const have = new Set(k.match(/\{\w+\}/g) ?? []);
  // A translation may drop English plural helpers ({v1} = "s"), but never invent placeholders.
  return (
    (v.match(/\{\w+\}/g) ?? []).some((p) => !have.has(p)) || (ph(k) !== ph(v) && !/\{v\d\}/.test(k))
  );
});
if (bad.length) {
  console.error('Placeholder mismatch:\n' + bad.map(([k, v]) => `  ${k}\n  ${v}`).join('\n'));
  process.exit(1);
}
const body = Object.entries(out)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
  .join('\n');
fs.writeFileSync(
  'src/i18n/de.ts',
  `import type { Dict } from './core';\n\n/** German interface text, keyed by the English source text (built by scripts/i18n-compile.mjs). */\nexport const de: Dict = {\n${body}\n};\n`,
);
console.log(`${Object.keys(out).length} translations`);
