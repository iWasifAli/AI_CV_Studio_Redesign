import { describe, expect, it } from 'vitest';
import { contrast } from '@/modules/templates/color';
import { FIXTURES } from '@/modules/resume/fixtures';
import { ops } from '@/modules/resume/ops';
import { buildDocumentHtml } from '@/modules/templates/build-document';
import { THEMES, inTheme, themesFor } from './themes';

const html = (d: Parameters<typeof buildDocumentHtml>[0]) =>
  buildDocumentHtml(d, { fonts: { kind: 'url', baseUrl: 'http://x' } });

describe('colour themes', () => {
  it('every curated accent is readable as text on white', () => {
    for (const t of THEMES) expect(contrast(t.accent, '#ffffff'), t.id).toBeGreaterThanOrEqual(4.5);
  });

  it('the design’s own colours come first, and "own" changes nothing', () => {
    const doc = ops.useDesign(FIXTURES.teacher, 'terra');
    expect(themesFor('terra')[0]!.id).toBe('own');
    expect(inTheme(doc, 'own')).toBe(doc);
    expect(inTheme(doc, undefined)).toBe(doc);
  });

  it('a theme recolours a graphic design’s dark and pale parts; switching design drops it', () => {
    const doc = inTheme(ops.useDesign(FIXTURES.teacher, 'terra'), 'forest');
    expect(doc.design.accent).toBe('#2f6b4f');
    expect(doc.design.palette).toMatchObject({ theme: 'forest', ink: '#183a2c' });
    expect(html(doc)).toContain(':root{--g-ink:#183a2c;--g-soft:#e9f5ee}');
    const back = ops.useDesign(doc, 'neon');
    expect(back.design.palette).toBeUndefined();
    expect(html(back)).not.toContain('--g-ink:#183a2c');
  });

  it('for other designs a theme is the accent colour, kept as the person’s choice', () => {
    const doc = inTheme(ops.useDesign(FIXTURES.teacher, 'clarity'), 'plum');
    expect(doc.design.accent).toBe('#6b3a75');
    expect(doc.design.palette).toBeUndefined();
    expect(doc.design.chosen).toContain('accent');
  });
});
