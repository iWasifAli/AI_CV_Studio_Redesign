/**
 * Every existing design renders exactly as it did when the catalogue moved to data (Part C): the
 * document HTML of each design × three sample CVs is hashed and compared with the recorded hashes.
 * A saved CV that uses a design therefore opens identically.
 *
 * An intended visual change to a design re-records with: UPDATE_RENDER_HASHES=1 npx vitest run
 * src/modules/design/render-identity.test.ts — and the change is named in the commit.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESIGN_IDS } from '@/modules/resume/ids';
import { DATA_DESIGN_IDS } from './data';
import { FIXTURES, PHOTO_FOR, withPhoto } from '@/modules/resume/fixtures';
import { ops } from '@/modules/resume/ops';
import { buildDocumentHtml } from '@/modules/templates/build-document';

const FILE = path.join(__dirname, 'render-hashes.json');
const SAMPLES = ['driver', 'teacher', 'engineer'] as const;

function hashes(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of DESIGN_IDS)
    for (const s of SAMPLES) {
      const doc = ops.useDesign(withPhoto(FIXTURES[s], PHOTO_FOR[s] ?? 'a'), id);
      const html = buildDocumentHtml(doc, { fonts: { kind: 'url', baseUrl: 'http://x' } });
      out[`${id}/${s}`] = createHash('sha256').update(html).digest('hex').slice(0, 16);
    }
  return out;
}

describe('render identity', () => {
  it('every design renders as recorded', () => {
    const now = hashes();
    if (process.env.UPDATE_RENDER_HASHES)
      fs.writeFileSync(FILE, JSON.stringify(now, null, 2) + '\n');
    const was = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Record<string, string>;
    const changed = Object.keys(was).filter((k) => was[k] !== now[k]);
    expect(changed).toEqual([]);
    // Every built-in design is recorded; designs added as files are recorded by the authoring kit.
    const missing = Object.keys(now).filter(
      (k) => !(k in was) && !(DATA_DESIGN_IDS as readonly string[]).includes(k.split('/')[0]!),
    );
    expect(missing).toEqual([]);
  });
});
