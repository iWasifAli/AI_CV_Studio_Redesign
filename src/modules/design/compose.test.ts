import { describe, expect, it } from 'vitest';

describe('compact grid (lists.compactColumns)', () => {
  it('puts short items n to a row, one block per row', async () => {
    const { FIXTURES } = await import('@/modules/resume/fixtures');
    const { ops } = await import('@/modules/resume/ops');
    const { specOf } = await import('@/modules/design/designer');
    const { buildDocumentHtml } = await import('@/modules/templates/build-document');
    let d = ops.useDesign(structuredClone(FIXTURES.teacher), 'spark');
    const sp = specOf(d.design);
    d = ops.setSpec(d, { ...sp, lists: { ...sp.lists, compactColumns: 2 } });
    const html = buildDocumentHtml(d, { fonts: { kind: 'url', baseUrl: 'http://x' } });
    // Teacher: 3 certifications → 2 rows; 2 languages → 1 row.
    expect(html.match(/b-compact-row/g)?.length).toBe(3);
    expect(html).toContain('Paediatric First Aid');
  });
});
