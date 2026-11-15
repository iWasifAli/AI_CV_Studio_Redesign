import { describe, expect, it } from 'vitest';
import { FIXTURES } from '@/modules/resume/fixtures';
import { applyPieces, collectPieces, lock, lockedWords, unlock } from './document';

describe('CV translation', () => {
  it('collects the words to translate and leaves names, employers and places out', () => {
    const pieces = collectPieces(FIXTURES.driver);
    const ids = pieces.map((p) => p.id);
    expect(ids).toContain('b.summary');
    expect(ids.some((i) => /\.role$/.test(i))).toBe(true);
    expect(ids.some((i) => /\.bullets\.0$/.test(i))).toBe(true);
    expect(ids.some((i) => /organization|institution|location/.test(i))).toBe(false);
  });

  it('locks names, employers, numbers, emails and links, and puts them back', () => {
    const words = lockedWords(FIXTURES.driver);
    const text = `Delivered 120 parcels a day for ${words.find((w) => w.length > 4)} — see https://x.co/a or a@b.com, +44 7700 900123, saved £3,000`;
    const l = lock(text, words);
    expect(l.text).not.toMatch(/120|https|a@b\.com|7700|3,000/);
    expect(l.tokens.length).toBeGreaterThanOrEqual(5);
    // A translation that keeps every token restores exactly.
    const back = unlock(l.text.replace('Delivered', 'Lieferte'), l.tokens)!;
    expect(back).toContain('120');
    expect(back).toContain('https://x.co/a');
    expect(back.startsWith('Lieferte')).toBe(true);
    // A lost or invented token is refused.
    expect(unlock(l.text.replace('⟦1⟧', ''), l.tokens)).toBeNull();
    expect(unlock(`${l.text} ⟦99⟧`, l.tokens)).toBeNull();
  });

  it('builds a translated copy and keeps the original unchanged', () => {
    const doc = FIXTURES.driver;
    const pieces = collectPieces(doc).map((p) => ({ ...p, text: `DE:${p.text}` }));
    const copy = applyPieces(doc, pieces, { code: 'de', locale: 'de-DE', name: 'Deutsch' }, 'new1');
    expect(copy.id).toBe('new1');
    expect(copy.locale).toBe('de-DE');
    expect(copy.title).toMatch(/\(Deutsch\)$/);
    expect(copy.basics.summary.startsWith('DE:')).toBe(true);
    expect(copy.basics.name).toBe(doc.basics.name);
    expect(copy.basics.email).toBe(doc.basics.email);
    expect(doc.basics.summary.startsWith('DE:')).toBe(false);
    const exp = copy.sections.find((s) => s.kind === 'experience')!.items[0] as {
      role: string;
      organization: string;
    };
    expect(exp.role.startsWith('DE:')).toBe(true);
    expect(exp.organization.startsWith('DE:')).toBe(false);
  });
});
