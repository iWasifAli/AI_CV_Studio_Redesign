import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARTICLES, CATEGORIES, articleBySlug } from './articles';

describe('learning centre guides', () => {
  it('has unique slugs', () => {
    expect(new Set(ARTICLES.map((a) => a.slug)).size).toBe(ARTICLES.length);
  });

  it('puts every guide in exactly one group', () => {
    const all = CATEGORIES.flatMap((c) => c.slugs);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(ARTICLES.map((a) => a.slug).sort());
  });

  for (const a of ARTICLES) {
    describe(a.slug, () => {
      it('is complete', () => {
        expect(a.steps.length).toBeGreaterThanOrEqual(3);
        expect(a.tips.length).toBeGreaterThan(0);
        expect(a.faqs.length).toBeGreaterThan(0);
        expect(a.shots.length).toBeGreaterThan(0);
      });
      it('has a real screenshot for every shot', () => {
        for (const s of a.shots) {
          expect(existsSync(`public/learn/${s.file}.webp`), s.file).toBe(true);
          expect(s.alt.length).toBeGreaterThan(20);
        }
      });
      it('points steps at screenshots that exist', () => {
        for (const s of a.steps) if (s.shot !== undefined) expect(a.shots[s.shot]).toBeDefined();
      });
      it('links only to guides that exist', () => {
        for (const r of a.related) expect(articleBySlug(r), r).toBeDefined();
        expect(a.related).not.toContain(a.slug);
      });
      it('has its video files when it names one', () => {
        if (a.video)
          for (const ext of ['mp4', 'vtt', 'webp'])
            expect(existsSync(`public/videos/${a.video}.${ext}`)).toBe(true);
      });
    });
  }
});
