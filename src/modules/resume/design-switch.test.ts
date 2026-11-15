import { describe, expect, it } from 'vitest';
import { engineer } from './fixtures';
import { buildDocumentHtml } from '@/modules/templates/build-document';
import { ops } from './ops';

// What the person sees: the built page (a design with or without its v2 form renders the same).
const look = (d: typeof engineer) =>
  buildDocumentHtml(
    { ...d, updatedAt: engineer.updatedAt },
    { fonts: { kind: 'url', baseUrl: 'https://cvstudio.test' } },
  );

describe('switching design (audit F-03)', () => {
  it('gives the same result whatever design was picked before', () => {
    const fresh = ops.useDesign(engineer, 'ledger');
    const viaBrief = ops.useDesign(ops.useDesign(engineer, 'brief'), 'ledger');
    expect(look(viaBrief)).toBe(look(fresh));
    const viaGraphic = ops.useDesign(ops.useDesign(engineer, 'cobalt'), 'linea');
    expect(look(viaGraphic)).toBe(look(ops.useDesign(engineer, 'linea')));
  });

  it('keeps what the person chose themselves', () => {
    let d = ops.setDesign(engineer, { density: 'airy', accent: '#7a1f4e' });
    expect(d.design.chosen?.sort()).toEqual(['accent', 'density']);
    d = ops.useDesign(ops.useDesign(d, 'brief'), 'ledger');
    expect(d.design.density).toBe('airy');
    expect(d.design.accent).toBe('#7a1f4e');
    d = ops.useDesign(d, 'cobalt');
    expect(d.design.accent).toBe('#7a1f4e');
  });

  it('keeps the paper size', () => {
    const d = ops.setDesign(engineer, { pageSize: 'Letter' });
    expect(ops.useDesign(ops.useDesign(d, 'brief'), 'heritage').design.pageSize).toBe('Letter');
  });
});
