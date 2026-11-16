/**
 * Distinctness (catalogue task, Part D): a structural signature per design, computed from what it
 * is built from — columns, header, heading style, entry layout, section placement, decoration,
 * side fill, photo and a few smaller parts. Colour and font are left out on purpose: two designs
 * that differ only in colour or typeface are the same layout.
 *
 * Distance is the weighted share of signature parts that differ (0 = the same structure,
 * 1 = nothing in common). The CI gate fails when two live designs are closer than THRESHOLD and
 * the pair is not on the owner-accepted list.
 */
import { BAND, COVER, RAIL, SPOT } from '@/modules/templates/graphic/catalog';
import { DESIGN_IDS } from '@/modules/resume/ids';
import { FIXTURES } from '@/modules/resume/fixtures';
import type { DesignId } from '@/modules/resume/schema';
import { designSpec } from './catalogue';
import type { DesignSpecV2 } from './spec';

export const SIGNATURE_PARTS = {
  layout: 3,
  header: 3,
  headings: 2,
  entries: 2,
  decoration: 2,
  placement: 1.5,
  photo: 1.5,
  sideFill: 1,
  container: 1,
  skills: 1,
  headingCase: 0.5,
} as const;
export type SignaturePart = keyof typeof SIGNATURE_PARTS;
export type Signature = Record<SignaturePart, string>;

/** Below this, two live designs are too close to both be offered without the owner's say-so. */
export const THRESHOLD = 0.25;

const GRAPHIC = new Map<string, Signature>();
for (const c of SPOT)
  GRAPHIC.set(c.id, {
    layout: `poster-${c.side}`,
    header: `poster+${c.portrait}`,
    headings: c.marker,
    entries: 'graphic-timeline',
    decoration: `art:${c.art}`,
    placement: `side-${c.side}`,
    photo: c.portrait,
    sideFill: 'none',
    container: `numbers:${c.numbers}`,
    skills: c.skills,
    headingCase: c.caps ? 'upper' : 'normal',
  });
for (const c of BAND)
  GRAPHIC.set(c.id, {
    layout: 'band-rail',
    header: `band+${c.photo}`,
    headings: c.marker,
    entries: 'graphic-timeline',
    decoration: `art:${c.art}+end:${c.end}`,
    placement: 'rail',
    photo: c.photo,
    sideFill: 'deep',
    container: `numbers:${c.numbers}`,
    skills: c.skills,
    headingCase: c.caps ? 'upper' : 'normal',
  });
for (const c of RAIL)
  GRAPHIC.set(c.id, {
    layout: 'full-rail',
    header: `rail+${c.nameStyle}`,
    headings: c.marker,
    entries: 'graphic-timeline',
    decoration: `panel:${c.panel}`,
    placement: 'rail',
    photo: c.photo,
    sideFill: 'deep',
    container: 'none',
    skills: c.skills,
    headingCase: c.nameStyle,
  });
for (const c of COVER)
  GRAPHIC.set(c.id, {
    layout: `cover-${c.side}`,
    header: `cover+${c.frame}`,
    headings: c.marker,
    entries: 'graphic-timeline',
    decoration: `pattern:${c.pattern}`,
    placement: `side-${c.side}`,
    photo: c.frame,
    sideFill: 'none',
    container: 'none',
    skills: c.skills,
    headingCase: c.caps ? 'upper' : 'normal',
  });

/** Signature of a spec (also used for new designs written as data). */
export function specSignature(s: DesignSpecV2): Signature {
  const twoCol = s.layout.type !== 'single' && s.layout.type !== 'timeline';
  return {
    layout: s.layout.type,
    header: [s.header.style, s.header.style === 'band' ? s.header.band : '', s.header.align]
      .filter(Boolean)
      .join('+'),
    headings: s.headings.style,
    entries: s.entries.layout,
    decoration: s.decor.kind,
    placement: twoCol
      ? `side:${[...s.placement.side].sort().join(',')}|third:${[...s.placement.third].sort().join(',')}`
      : 'none',
    photo: s.header.photo.show ? `${s.header.photo.shape}@${s.header.photo.position}` : 'none',
    sideFill: twoCol ? s.layout.sideFill : 'none',
    container: s.sections.container,
    skills: s.lists.skills.style,
    headingCase: s.headings.case,
  };
}

export function signature(id: DesignId): Signature {
  return GRAPHIC.get(id) ?? specSignature(designSpec(id, FIXTURES.teacher.design));
}

export function distance(a: Signature, b: Signature): number {
  let total = 0;
  let diff = 0;
  for (const [k, w] of Object.entries(SIGNATURE_PARTS) as [SignaturePart, number][]) {
    total += w;
    if (a[k] !== b[k]) diff += w;
  }
  return Math.round((diff / total) * 1000) / 1000;
}

export type Pair = { a: DesignId; b: DesignId; distance: number; same: SignaturePart[] };

/** All pairs among the given designs, closest first. */
export function nearestPairs(ids: readonly DesignId[] = DESIGN_IDS): Pair[] {
  const sig = new Map(ids.map((id) => [id, signature(id)] as const));
  const out: Pair[] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = sig.get(ids[i]!)!;
      const b = sig.get(ids[j]!)!;
      out.push({
        a: ids[i]!,
        b: ids[j]!,
        distance: distance(a, b),
        same: (Object.keys(SIGNATURE_PARTS) as SignaturePart[]).filter((k) => a[k] === b[k]),
      });
    }
  return out.sort((x, y) => x.distance - y.distance || x.a.localeCompare(y.a));
}

export const pairKey = (a: string, b: string) => [a, b].sort().join('~');
