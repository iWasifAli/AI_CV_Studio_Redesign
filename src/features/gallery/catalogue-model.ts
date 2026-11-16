/**
 * Gallery logic without UI (catalogue Parts A and B): which designs show, in what order, and which
 * are recommended. Pure functions, unit-tested; the gallery page and the editor's design browser
 * both use them.
 */
import { DESIGNS, FAMILY_LABEL, type DesignMeta, type Family } from '@/modules/design/designs';
import {
  TAG_LABEL,
  defaultAddedAt,
  defaultTags,
  designLabel,
  type DesignLabel,
  type DesignTag,
} from '@/modules/design/lifecycle';
import type { PresetId } from '@/modules/resume/professions';
import type { DesignId, ResumeDocument } from '@/modules/resume/schema';
import { designSpec } from '@/modules/design/catalogue';
import { isSpecDesign } from '@/modules/design/designs';
import { normalise } from '@/modules/design/normalise';

export type CatalogueItem = {
  /** Unique per card (the 300-card load test repeats designs). */
  key: string;
  id: DesignId;
  meta: DesignMeta;
  tags: DesignTag[];
  label: DesignLabel;
  addedAt: string;
  premium: boolean;
  /** Catalogue position (stable tie-break). */
  order: number;
};

type Entry = { id: string; enabled: boolean; tier: string; tags?: DesignTag[]; addedAt?: string };

/** Live designs with their owner-set data (or the defaults before entitlements load). */
export function catalogueItems(entries: Entry[] | null, keep?: DesignId): CatalogueItem[] {
  const byId = new Map((entries ?? []).map((e) => [e.id, e]));
  return DESIGNS.flatMap((meta, order) => {
    const e = byId.get(meta.id);
    if (entries && (!e || !e.enabled) && meta.id !== keep) return [];
    return [
      {
        key: meta.id,
        id: meta.id,
        meta,
        tags: e?.tags ?? defaultTags(meta.id),
        label: designLabel(meta),
        addedAt: e?.addedAt ?? defaultAddedAt(meta.id),
        premium: e?.tier === 'premium',
        order,
      },
    ];
  });
}

export type Filters = {
  text: string;
  family: Family | 'all';
  tags: DesignTag[];
  columns: 'any' | '1' | '2' | '3';
  photo: 'any' | 'with' | 'without';
  work: PresetId | '';
  online: boolean;
  favouritesOnly: boolean;
};
export const NO_FILTERS: Filters = {
  text: '',
  family: 'all',
  tags: [],
  columns: 'any',
  photo: 'any',
  work: '',
  online: false,
  favouritesOnly: false,
};

export function activeFilterCount(f: Filters): number {
  return (
    (f.text.trim() ? 1 : 0) +
    (f.family !== 'all' ? 1 : 0) +
    f.tags.length +
    (f.columns !== 'any' ? 1 : 0) +
    (f.photo !== 'any' ? 1 : 0) +
    (f.work ? 1 : 0) +
    (f.online ? 1 : 0) +
    (f.favouritesOnly ? 1 : 0)
  );
}

const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** Search matches name, look, description, family and tags; every word must match. */
export function matchesText(item: CatalogueItem, text: string): boolean {
  const q = words(text).split(/\s+/).filter(Boolean);
  if (!q.length) return true;
  const hay = words(
    [
      item.meta.name,
      item.meta.style,
      item.meta.description,
      FAMILY_LABEL[item.meta.family].name,
      ...item.tags.map((t) => TAG_LABEL[t]),
      item.label === 'ats' ? 'ats-friendly ats' : 'creative',
      item.meta.photo ? 'photo' : '',
    ].join(' '),
  );
  return q.every((w) => hay.includes(w));
}

export function filterItems(
  items: CatalogueItem[],
  f: Filters,
  favourites: ReadonlySet<string> = new Set(),
): CatalogueItem[] {
  return items.filter(
    (d) =>
      matchesText(d, f.text) &&
      (f.family === 'all' || d.meta.family === f.family) &&
      f.tags.every((t) => d.tags.includes(t)) &&
      (f.columns === 'any' || String(d.meta.columns) === f.columns) &&
      (f.photo === 'any' || (f.photo === 'with') === d.meta.photo) &&
      (!f.work || (d.meta.fit[f.work] ?? 0) >= 0.7) &&
      (!f.online || d.label === 'ats') &&
      (!f.favouritesOnly || favourites.has(d.id)),
  );
}

export const SORTS = ['best', 'newest', 'popular'] as const;
export type Sort = (typeof SORTS)[number];
export const SORT_LABEL: Record<Sort, string> = {
  best: 'Best for you',
  newest: 'Newest',
  popular: 'Most used',
};

/** How well a design suits this person's kind of work (0–1, 0.5 when unknown). */
export const fitFor = (d: CatalogueItem, preset: PresetId | null) =>
  preset ? (d.meta.fit[preset] ?? 0.4) : 0.5;

export function sortItems(
  items: CatalogueItem[],
  sort: Sort,
  ctx: { preset: PresetId | null; popularity: Record<string, number> },
): CatalogueItem[] {
  const pop = (d: CatalogueItem) => ctx.popularity[d.id] ?? 0;
  const list = [...items];
  if (sort === 'newest')
    return list.sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.order - b.order);
  if (sort === 'popular') return list.sort((a, b) => pop(b) - pop(a) || a.order - b.order);
  // Best for you: fit to the kind of work, in steps of 0.1 so usage decides between near-equals.
  const step = (d: CatalogueItem) => Math.round(fitFor(d, ctx.preset) * 10);
  return list.sort((a, b) => step(b) - step(a) || pop(b) - pop(a) || a.order - b.order);
}

/**
 * Up to `n` recommendations for this CV: best fit, then usage; no more than two from one family
 * so the choice is varied; the current design and Creative designs first-picks are left out
 * (Creative ones are still shown after the first pick — G-09).
 */
export function recommend(
  items: CatalogueItem[],
  ctx: {
    preset: PresetId | null;
    popularity: Record<string, number>;
    current?: DesignId | null;
    /** This CV: designs that would have to drop a column for it are not recommended. */
    doc?: ResumeDocument;
  },
  n = 6,
): CatalogueItem[] {
  const sorted = sortItems(
    items.filter((d) => d.id !== ctx.current && (!ctx.doc || keepsItsLayout(d.id, ctx.doc))),
    'best',
    ctx,
  );
  const out: CatalogueItem[] = [];
  const perFamily = new Map<string, number>();
  for (const d of sorted) {
    if (out.length >= n) break;
    if (out.length === 0 && d.label === 'creative') continue;
    const c = perFamily.get(d.meta.family) ?? 0;
    if (c >= 2) continue;
    perFamily.set(d.meta.family, c + 1);
    out.push(d);
  }
  return out;
}

/**
 * Whether a design keeps its own layout for this CV. A three-column design whose side columns
 * would be nearly empty falls back to two columns (G-11); it is then not what its card promises.
 */
export function keepsItsLayout(id: DesignId, doc: ResumeDocument): boolean {
  if (!isSpecDesign(id)) return true;
  const spec = designSpec(id, doc.design);
  return normalise(spec, doc).spec.layout.type === spec.layout.type;
}

/** The 300-card load test: the catalogue repeated with unique keys. */
export function seeded(items: CatalogueItem[], count: number): CatalogueItem[] {
  if (!items.length) return [];
  return Array.from({ length: count }, (_, i) => {
    const d = items[i % items.length]!;
    return { ...d, key: `${d.id}-${i}`, order: i };
  });
}
