import { describe, expect, it } from 'vitest';
import { PRESETS } from '@/modules/resume/presets';
import { GUIDES, guideBySlug } from './guides';

describe('profession guides', () => {
  it('have unique slugs and presets that exist', () => {
    expect(new Set(GUIDES.map((g) => g.slug)).size).toBe(GUIDES.length);
    for (const g of GUIDES) expect(PRESETS[g.preset]).toBeDefined();
  });
  it('carry real content, not thin pages', () => {
    for (const g of GUIDES) {
      expect(g.tips.length).toBeGreaterThanOrEqual(4);
      expect(g.mistakes.length).toBeGreaterThanOrEqual(3);
      expect(g.metaDescription.length).toBeGreaterThan(100);
      expect(g.metaDescription.length).toBeLessThanOrEqual(175);
    }
  });
  it('finds by slug', () => {
    expect(guideBySlug('drivers')?.preset).toBe('driver');
    expect(guideBySlug('nope')).toBeUndefined();
  });
});
