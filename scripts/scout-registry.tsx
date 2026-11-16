/**
 * Template Discovery Registry (docs/catalogue/discovery-registry.json).
 *
 *   npx tsx scripts/scout-registry.tsx            refresh the "existing" list from the catalogue
 *   npx tsx scripts/scout-registry.tsx --check    also fail if a proposal repeats an existing or
 *                                                 earlier concept (same structure key)
 *
 * The registry keeps every proposal ever made (approved, rejected, implemented, incomplete) with
 * its references and reasons, so no concept is suggested twice.
 */
import fs from 'node:fs';
import { DESIGNS, FAMILY_LABEL } from '../src/modules/design/designs';
import { designLabel } from '../src/modules/design/lifecycle';
import { signature } from '../src/modules/design/distinctness';
import { DEFAULT_CONFIG } from '../src/modules/billing/config';

const FILE = 'docs/catalogue/discovery-registry.json';
type Proposal = {
  id: string;
  date: string;
  name: string;
  concept: string;
  /** Layout architecture in a few words: what makes it structurally new. */
  structureKey: string;
  references: { title: string; url: string; idea: string }[];
  status: 'proposed' | 'approved' | 'rejected' | 'implemented' | 'incomplete';
  scores?: Record<string, number>;
  decision?: { by: string; date: string; reason: string };
  nearestExisting?: string;
  implementation?: {
    branch?: string;
    pr?: string;
    designId?: string;
    finalScore?: number;
    blockers?: string[];
  };
};
type Registry = {
  updated: string;
  existing: Record<string, unknown>[];
  proposals: Proposal[];
  learnings: string[];
};

const reg: Registry = fs.existsSync(FILE)
  ? (JSON.parse(fs.readFileSync(FILE, 'utf8')) as Registry)
  : { updated: '', existing: [], proposals: [], learnings: [] };
reg.existing = DESIGNS.map((d) => {
  const e = DEFAULT_CONFIG.designs.find((x) => x.id === d.id);
  return {
    id: d.id,
    name: d.name,
    family: FAMILY_LABEL[d.family].name,
    look: d.style,
    description: d.description,
    status: e?.status ?? 'live',
    label: designLabel(d) === 'ats' ? 'ATS-friendly' : 'Creative',
    structure: signature(d.id),
  };
});
reg.updated = new Date().toISOString().slice(0, 10);
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
if (process.argv.includes('--check')) {
  const seen = new Map<string, string>();
  const dup: string[] = [];
  for (const p of reg.proposals) {
    const k = norm(p.structureKey);
    if (seen.has(k)) dup.push(`${p.id} repeats ${seen.get(k)} ("${p.structureKey}")`);
    seen.set(k, p.id);
  }
  if (dup.length) {
    console.error(dup.join('\n'));
    process.exit(1);
  }
}
fs.writeFileSync(FILE, JSON.stringify(reg, null, 2) + '\n');
console.log(`registry: ${reg.existing.length} existing designs, ${reg.proposals.length} proposals`);
