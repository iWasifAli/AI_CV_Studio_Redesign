import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES, PHOTO_FOR, withPhoto, type FixtureId } from '@/modules/resume/fixtures';
import { DESIGN_IDS } from '@/modules/resume/ids';
import { ops } from '@/modules/resume/ops';
import { buildDocumentHtml } from '@/modules/templates/build-document';
import { DATA_DESIGN_FILES, DATA_DESIGN_IDS } from './data';
import { inDataDesign, readDataDesign } from './data-design';
import { DESIGNS } from './designs';

const html = (d: Parameters<typeof buildDocumentHtml>[0]) =>
  buildDocumentHtml(d, { fonts: { kind: 'url', baseUrl: 'http://x' } });
const SAMPLES: FixtureId[] = ['driver', 'teacher', 'nurse', 'graduate', 'engineer', 'executive'];

describe('designs as data (Part F)', () => {
  it('Neon rebuilt as a design file draws exactly the original on all six sample CVs', () => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data/rebuilt/neon.json'), 'utf8'),
    ) as unknown;
    const r = readDataDesign(raw);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    for (const s of SAMPLES) {
      const base = withPhoto(FIXTURES[s], PHOTO_FOR[s] ?? 'a');
      const original = html(ops.useDesign(base, 'neon')).replace(
        'data-template="neon"',
        'data-template="custom"',
      );
      expect(html(inDataDesign(base, r.file, r.spec)), s).toBe(original);
    }
  });

  it('every design file in the catalogue is valid and registered', () => {
    expect(DATA_DESIGN_FILES).toHaveLength(DATA_DESIGN_IDS.length);
    const names = new Set<string>();
    for (const raw of DATA_DESIGN_FILES) {
      const r = readDataDesign(raw);
      expect(r.ok ? [] : r.errors).toEqual([]);
      if (!r.ok) continue;
      expect(DESIGN_IDS).toContain(r.file.id);
      expect(DESIGNS.find((d) => d.id === r.file.id)?.name).toBe(r.file.name);
      if (r.spec.graphic) expect(r.file.family).toBe('graphic');
    }
    for (const d of DESIGNS) {
      expect(names.has(d.name), `duplicate name ${d.name}`).toBe(false);
      names.add(d.name);
    }
  });

  it('a design file is read strictly: no silent fallbacks', () => {
    const r = readDataDesign({
      id: 'x1',
      name: 'X',
      style: 'Test',
      description: 'A design file used in a test only.',
      family: 'graphic',
      fontPair: 'bold',
      accent: '#123456',
      photo: true,
      tags: ['bold'],
      fallback: 'neon',
      spec: { graphic: { layout: 'poster', frame: 'triangle' } },
    });
    expect(r.ok).toBe(false);
  });
});
