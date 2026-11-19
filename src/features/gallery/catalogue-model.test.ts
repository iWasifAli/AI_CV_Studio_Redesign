import { describe, expect, it } from 'vitest';
import { DESIGN_IDS } from '@/modules/resume/ids';
import { normaliseEntry } from '@/modules/design/lifecycle';
import { FIXTURES } from '@/modules/resume/fixtures';
import { shortlist, MAX_THUMBS } from '@/features/editor/design-shortlist';
import {
  NO_FILTERS,
  activeFilterCount,
  catalogueItems,
  filterItems,
  keepsItsLayout,
  recommend,
  seeded,
  sortItems,
} from './catalogue-model';

const entries = DESIGN_IDS.map((id) =>
  normaliseEntry({ id, enabled: id !== 'ruby', tier: id === 'neon' ? 'premium' : 'free' }),
);
const items = catalogueItems(entries);
const ids = (l: { id: string }[]) => l.map((d) => d.id);

describe('gallery: which designs show', () => {
  it('only live designs, except the one a CV already uses', () => {
    expect(ids(items)).not.toContain('ruby');
    expect(ids(catalogueItems(entries, 'ruby'))).toContain('ruby');
    expect(items.find((d) => d.id === 'neon')?.premium).toBe(true);
    // Before entitlements load, everything shows with default tags.
    expect(catalogueItems(null)).toHaveLength(DESIGN_IDS.length);
  });

  it('search matches name, look, family and tags; every word must match', () => {
    expect(ids(filterItems(items, { ...NO_FILTERS, text: 'terra' }))).toEqual(['terra']);
    expect(ids(filterItems(items, { ...NO_FILTERS, text: 'TIMELINE' }))).toEqual(
      expect.arrayContaining(['chronicle', 'milestone', 'pathway', 'route']),
    );
    const academic = filterItems(items, { ...NO_FILTERS, text: 'academic classic' });
    expect(academic.length).toBeGreaterThan(0);
    expect(
      academic.every((d) => d.tags.includes('academic') || /academic/i.test(d.meta.style)),
    ).toBe(true);
    expect(filterItems(items, { ...NO_FILTERS, text: 'zzz' })).toEqual([]);
  });

  it('tags combine (all must match); other filters narrow further', () => {
    const both = filterItems(items, { ...NO_FILTERS, tags: ['creative', 'elegant'] });
    expect(both.length).toBeGreaterThan(0);
    expect(both.every((d) => d.tags.includes('creative') && d.tags.includes('elegant'))).toBe(true);
    const online = filterItems(items, { ...NO_FILTERS, online: true });
    expect(online.every((d) => d.label === 'ats')).toBe(true);
    expect(ids(online)).not.toContain('neon');
    const threeCols = filterItems(items, { ...NO_FILTERS, columns: '3' });
    expect(threeCols.every((d) => d.meta.columns === 3)).toBe(true);
    const noPhoto = filterItems(items, { ...NO_FILTERS, photo: 'without' });
    expect(noPhoto.every((d) => !d.meta.photo)).toBe(true);
    const fav = filterItems(items, { ...NO_FILTERS, favouritesOnly: true }, new Set(['terra']));
    expect(ids(fav)).toEqual(['terra']);
    expect(activeFilterCount({ ...NO_FILTERS, tags: ['bold', 'minimal'], online: true })).toBe(3);
  });

  it('sorts: best for you (fit, then usage), newest, most used', () => {
    const pop = { clarity: 1, heritage: 50 };
    const best = sortItems(items, 'best', { preset: 'office', popularity: pop });
    const fit = (d: (typeof items)[number]) => Math.round((d.meta.fit.office ?? 0.4) * 10);
    for (let i = 1; i < best.length; i++)
      expect(fit(best[i - 1]!)).toBeGreaterThanOrEqual(fit(best[i]!));
    const newest = sortItems(items, 'newest', { preset: null, popularity: {} });
    expect(newest[0]!.addedAt >= newest.at(-1)!.addedAt).toBe(true);
    // Newest first: whatever was added last (graphic designs, or later data designs).
    expect(newest[0]!.addedAt).toBe(
      items
        .map((i) => i.addedAt)
        .sort()
        .at(-1),
    );
    const popular = sortItems(items, 'popular', { preset: null, popularity: pop });
    expect(ids(popular).slice(0, 2)).toEqual(['heritage', 'clarity']);
  });

  it('recommendations: varied families, never a Creative design first, not the current one', () => {
    const r = recommend(items, { preset: 'tech', popularity: {}, current: 'clarity' }, 6);
    expect(r).toHaveLength(6);
    expect(r[0]!.label).toBe('ats');
    expect(ids(r)).not.toContain('clarity');
    const fams = new Map<string, number>();
    for (const d of r) fams.set(d.meta.family, (fams.get(d.meta.family) ?? 0) + 1);
    expect(Math.max(...fams.values())).toBeLessThanOrEqual(2);
  });

  it('never recommends a design that would have to drop a column for this CV', () => {
    const doc = FIXTURES.engineer;
    expect(keepsItsLayout('mosaic', doc)).toBe(false);
    expect(keepsItsLayout('matrix', doc)).toBe(false);
    expect(keepsItsLayout('clarity', doc)).toBe(true);
    const r = recommend(items, { preset: 'tech', popularity: {}, current: 'clarity', doc }, 6);
    expect(ids(r)).not.toContain('mosaic');
    expect(ids(r)).not.toContain('matrix');
    expect(r).toHaveLength(6);
  });

  it('300-card load test list has unique keys', () => {
    const s = seeded(items, 300);
    expect(s).toHaveLength(300);
    expect(new Set(s.map((d) => d.key)).size).toBe(300);
  });
});

describe('Design tab shortlist', () => {
  it('never more than 8 thumbnails including the current design', () => {
    for (const favourites of [[], ['terra'], ['terra', 'neon', 'coral', 'ocean']]) {
      const s = shortlist(items, {
        current: 'clarity',
        preset: 'office',
        popularity: {},
        favourites,
        recent: ['heritage', 'lens'],
      });
      expect(1 + s.mine.length + s.recommended.length).toBeLessThanOrEqual(MAX_THUMBS);
      expect(s.recommended.length).toBeLessThanOrEqual(6);
      expect(ids([...s.mine, ...s.recommended])).not.toContain('clarity');
      expect(new Set(ids([...s.mine, ...s.recommended])).size).toBe(
        s.mine.length + s.recommended.length,
      );
    }
  });

  it('saved designs come first, retired or unknown ones are skipped', () => {
    const s = shortlist(items, {
      current: 'clarity',
      preset: null,
      popularity: {},
      favourites: ['ruby', 'terra'],
      recent: ['lens'],
    });
    expect(ids(s.mine)).toEqual(['terra', 'lens']);
  });
});
