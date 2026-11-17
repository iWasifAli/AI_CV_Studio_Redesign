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
import type { DesignSpecV2, GraphicSpec } from './spec';

/**
 * Weights: the page structure counts most. Decoration — artwork, photo frame shape, heading
 * markers — counts little, so a copy of a layout with different ornaments is still flagged
 * (owner, 2026-11-16: "decoration counts for less").
 */
export const SIGNATURE_PARTS = {
  layout: 3,
  header: 3,
  headings: 2,
  entries: 2,
  decoration: 0.75,
  placement: 1.5,
  photo: 0.75,
  sideFill: 1,
  container: 1,
  skills: 1,
  headingCase: 0.5,
} as const;
export type SignaturePart = keyof typeof SIGNATURE_PARTS;
export type Signature = Record<SignaturePart, string>;

/** Below this, two live designs are too close to both be offered without the owner's say-so. */
export const THRESHOLD = 0.25;

/** Signature of a graphic layout from its building blocks. */
export function graphicSignature(g: GraphicSpec): Signature {
  if (g.layout === 'table')
    return {
      layout: 'table-grid',
      header: 'fact-table',
      headings: 'table-head-labels',
      entries: 'table-rows',
      decoration: [g.art, g.marker].join('+'),
      placement: 'none',
      photo: g.frame,
      sideFill: 'none',
      container: `numbers:${g.numbers}`,
      skills: 'table-rows',
      headingCase: g.caps ? 'upper' : 'normal',
    };
  const side = 'side' in g ? g.side : 'rail';
  const rail = g.layout === 'band' || g.layout === 'rail';
  return {
    layout: g.layout === 'poster' || g.layout === 'cover' ? `${g.layout}-${side}` : g.layout,
    // The header is the layout's own; its photo frame is counted once, under photo.
    header: g.layout,
    // Heading markers, artwork and end marks are ornaments: one decoration part.
    headings: 'graphic',
    entries: 'graphic-timeline',
    decoration: [g.art, g.marker, g.layout === 'band' ? g.end : ''].join('+'),
    placement: rail ? 'rail' : `side-${side}`,
    photo: g.frame,
    sideFill: rail ? 'deep' : 'none',
    container: 'numbers' in g ? `numbers:${g.numbers}` : 'none',
    skills: g.skills,
    headingCase: g.layout === 'rail' ? g.nameStyle : g.caps ? 'upper' : 'normal',
  };
}

const tones = (c: { ink: string; soft: string }) => ({ ink: c.ink, soft: c.soft });
const GRAPHIC = new Map<string, Signature>([
  ...SPOT.map(
    (c) =>
      [
        c.id,
        graphicSignature({
          layout: 'poster',
          frame: c.portrait,
          art: c.art,
          numbers: c.numbers,
          marker: c.marker,
          skills: c.skills,
          side: c.side,
          caps: c.caps,
          stop: c.stop,
          ...tones(c),
        }),
      ] as const,
  ),
  ...BAND.map(
    (c) =>
      [
        c.id,
        graphicSignature({
          layout: 'band',
          frame: c.photo,
          art: c.art,
          numbers: c.numbers,
          marker: c.marker,
          skills: c.skills,
          caps: c.caps,
          stop: c.stop,
          end: c.end,
          railMm: c.railMm,
          ...tones(c),
        }),
      ] as const,
  ),
  ...RAIL.map(
    (c) =>
      [
        c.id,
        graphicSignature({
          layout: 'rail',
          frame: c.photo,
          art: c.panel,
          ornament: c.ornament,
          nameStyle: c.nameStyle,
          marker: c.marker,
          skills: c.skills,
          railMm: c.railMm,
          ...tones(c),
        }),
      ] as const,
  ),
  ...COVER.map(
    (c) =>
      [
        c.id,
        graphicSignature({
          layout: 'cover',
          frame: c.frame,
          art: c.pattern,
          marker: c.marker,
          skills: c.skills,
          side: c.side,
          caps: c.caps,
          stop: c.stop,
          ...tones(c),
        }),
      ] as const,
  ),
]);

/** Signature of a spec (also used for new designs written as data). */
export function specSignature(s: DesignSpecV2): Signature {
  if (s.graphic) return graphicSignature(s.graphic);
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
