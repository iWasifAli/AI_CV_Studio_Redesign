import { z } from 'zod';
import {
  DENSITIES,
  FONT_PAIR_IDS,
  PAGE_SIZES,
  DESIGN_IDS,
  SPEC_DESIGN_IDS,
  TEMPLATE_IDS,
} from '@/modules/resume/ids';

/**
 * Design Spec v2 (complete-studio-spec §7.3, Appendix A): the bounded design vocabulary.
 * Every field is an enum or a clamped number and has a default, so `{}` parses to a valid spec
 * (a plain single-column design). The AI (R7) and the Design Studio only ever produce values of
 * this schema; the composer (compose.tsx) can render every value it accepts.
 *
 * Differences from the spec, by decision (docs/STATUS.md, R6):
 *  - Fonts stay as the 5 tested font pairs (`type.pair`) until the catalogue grows in R7.
 *  - Section placement is by section kind (custom sections stay in the main column).
 */

const clamp = (min: number, max: number, dflt: number) =>
  z
    .number()
    .catch(dflt)
    .transform((n) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : dflt)))
    .default(dflt);
/** Enums fall back to their default instead of failing (unknown AI values never break a spec). */
const pick = <T extends readonly [string, ...string[]]>(values: T, dflt: T[number]) =>
  z.enum(values).catch(dflt).default(dflt);
const flag = (dflt: boolean) => z.boolean().catch(dflt).default(dflt);
const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((s) => s.toLowerCase());

export const LAYOUTS = [
  'single',
  'sidebar-left',
  'sidebar-right',
  'two-equal',
  'rails',
  'label-column',
  'timeline',
] as const;
export const SIDE_FILLS = ['none', 'tint', 'solid', 'deep'] as const;
export const HEADER_STYLES = [
  'plain',
  'centered',
  'band',
  'split',
  'card',
  'monogram',
  'in-sidebar',
] as const;
export const BANDS = ['solid', 'gradient', 'angled'] as const;
export const SIZES = ['S', 'M', 'L', 'XL'] as const;
export const CASES = ['normal', 'upper', 'small-caps'] as const;
export const HEADING_STYLES = [
  'plain',
  'underline',
  'overline',
  'rule-after',
  'bar-left',
  'filled',
  'boxed',
  'numbered',
  'icon',
] as const;
export const CONTAINERS = ['none', 'card', 'outlined', 'tinted-heading'] as const;
export const DIVIDERS = ['none', 'line', 'dotted', 'accent-line', 'space'] as const;
export const ENTRY_LAYOUTS = ['stacked', 'dates-right', 'dates-left', 'timeline-dots'] as const;
export const DATE_FORMATS = ['MMM YYYY', 'MM/YYYY', 'YYYY'] as const;
export const MARKERS = [
  'disc',
  'square',
  'dash',
  'arrow',
  'chevron',
  'check',
  'diamond',
  'none',
] as const;
export const SKILL_STYLES = ['tags', 'inline', 'columns', 'grouped-list', 'bars', 'dots'] as const;
export const DECOR_KINDS = [
  'none',
  'top-bar',
  'side-stripe',
  'corner-shapes',
  'frame',
  'dot-grid',
  'watermark-initials',
] as const;
/** Signature artwork of the hand-crafted catalogue designs (registered, never generated). */
export const SIGNATURE_DECOR = TEMPLATE_IDS.map((id) => `signature:${id}` as const);
export const COLOR_MODES = ['mono', 'accent', 'duo'] as const;
export const INKS = ['black', 'charcoal', 'navy'] as const;
export const BACKGROUNDS = ['white', 'cream', 'tint'] as const;

/** Section kinds that are short enough for a narrow column. */
export const COMPACT_KINDS = [
  'skills',
  'languages',
  'certifications',
  'licences',
  'awards',
] as const;
export type CompactKind = (typeof COMPACT_KINDS)[number];

const kindList = z
  .array(z.enum(COMPACT_KINDS))
  .catch([])
  .transform((a) => [...new Set(a)])
  .default([]);

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const MARKER_LOOKS = ['bar', 'dot', 'slash', 'number', 'square', 'line'] as const;
const SKILL_LOOKS = ['bars', 'segments', 'dots'] as const;
/** Building blocks of the graphic layouts (Part F), as values a design file can choose. */
export const GRAPHIC_BLOCKS = {
  poster: {
    frame: ['arch', 'circle', 'squircle', 'leaf', 'hexagon'],
    art: ['rings', 'beams', 'dots', 'waves', 'blocks'],
    numbers: ['band', 'cards', 'ruled'],
  },
  band: {
    frame: ['notch', 'circle', 'tall', 'slant', 'square'],
    art: ['quarter', 'stripes', 'grid', 'ring', 'dots'],
    numbers: ['box', 'columns', 'pills'],
  },
  rail: {
    frame: ['block', 'arch', 'inset', 'circle', 'split'],
    art: ['gradient', 'solid', 'lines', 'dots', 'frame'],
  },
  cover: {
    frame: ['tilt', 'ring', 'diamond', 'blob', 'offset'],
    art: ['hatch', 'grid', 'rays', 'confetti', 'bubbles'],
  },
  table: {
    frame: ['square', 'circle', 'tall'],
    art: ['heavy', 'double', 'band'],
    numbers: ['cells', 'inline'],
  },
} as const;
const G = GRAPHIC_BLOCKS;
const tones = { ink: hex6, soft: hex6 };
const looks = { marker: z.enum(MARKER_LOOKS), skills: z.enum(SKILL_LOOKS) };
export const graphicSpec = z.discriminatedUnion('layout', [
  z.object({
    layout: z.literal('poster'),
    frame: z.enum(G.poster.frame),
    art: z.enum(G.poster.art),
    numbers: z.enum(G.poster.numbers),
    ...looks,
    side: z.enum(['left', 'right']),
    caps: z.boolean(),
    stop: z.string().max(2),
    ...tones,
  }),
  z.object({
    layout: z.literal('band'),
    frame: z.enum(G.band.frame),
    art: z.enum(G.band.art),
    numbers: z.enum(G.band.numbers),
    ...looks,
    caps: z.boolean(),
    stop: z.string().max(2),
    end: z.enum(['bar', 'outline', 'none']),
    railMm: z.number().min(60).max(76),
    ...tones,
  }),
  z.object({
    layout: z.literal('rail'),
    frame: z.enum(G.rail.frame),
    art: z.enum(G.rail.art),
    ornament: z.string().max(2),
    nameStyle: z.enum(['heavy', 'light']),
    ...looks,
    railMm: z.number().min(60).max(76),
    ...tones,
  }),
  z.object({
    layout: z.literal('cover'),
    frame: z.enum(G.cover.frame),
    art: z.enum(G.cover.art),
    ...looks,
    side: z.enum(['left', 'right']),
    caps: z.boolean(),
    stop: z.string().max(2),
    ...tones,
  }),
  z.object({
    layout: z.literal('table'),
    frame: z.enum(G.table.frame),
    /** How each section table is opened: a heavy rule, a double rule or a tinted band. */
    art: z.enum(G.table.art),
    /** Key numbers: their own row of large figures, or cells in the fact table. */
    numbers: z.enum(G.table.numbers),
    ...looks,
    caps: z.boolean(),
    ...tones,
  }),
]);

export const designSpecV2 = z.object({
  version: z.literal(2).catch(2).default(2),
  /**
   * Catalogue design this spec is attached to. While attached, the design renders with that
   * design's hand-crafted signature code and only the "overridable" fields below apply; changing
   * any other field detaches it (baseId removed) and the generic composer takes over.
   */
  baseId: z.enum(TEMPLATE_IDS).optional().catch(undefined),
  /**
   * Spec-only catalogue design (R7) this spec still is. Rendered by the composer like any spec;
   * kept while only the overridable fields change, so the design keeps its catalogue tier.
   */
  designId: z.enum(SPEC_DESIGN_IDS).optional().catch(undefined),
  /** Catalogue design a custom design was started from ("Back to …"). */
  origin: z.enum(DESIGN_IDS).optional().catch(undefined),
  /** "ATS-safe version": render one plain column with standard headings (applied by normalise). */
  atsSafe: flag(false),
  page: z
    .object({
      size: pick(PAGE_SIZES, 'A4'),
      marginMm: clamp(10, 22, 16),
      background: pick(BACKGROUNDS, 'white'),
    })
    .default({ size: 'A4', marginMm: 16, background: 'white' }),
  layout: z
    .object({
      type: pick(LAYOUTS, 'single'),
      sideWidthPct: clamp(20, 40, 32),
      gapMm: clamp(4, 10, 7),
      sideFill: pick(SIDE_FILLS, 'tint'),
      sideBleed: flag(false),
      continuation: pick(['full-width', 'keep-columns'] as const, 'full-width'),
    })
    .default({
      type: 'single',
      sideWidthPct: 32,
      gapMm: 7,
      sideFill: 'tint',
      sideBleed: false,
      continuation: 'full-width',
    }),
  placement: z
    .object({
      side: kindList,
      third: kindList,
      contactIn: pick(['header', 'side'] as const, 'header'),
    })
    .default({ side: [], third: [], contactIn: 'header' }),
  header: z
    .object({
      style: pick(HEADER_STYLES, 'plain'),
      band: pick(BANDS, 'solid'),
      align: pick(['left', 'center'] as const, 'left'),
      name: z
        .object({
          size: pick(SIZES, 'L'),
          case: pick(CASES, 'normal'),
          weight: z
            .union([z.literal(400), z.literal(600), z.literal(700), z.literal(800)])
            .catch(700)
            .default(700),
          twoTone: flag(false),
          trackingEm: clamp(-0.02, 0.3, 0),
        })
        .default({ size: 'L', case: 'normal', weight: 700, twoTone: false, trackingEm: 0 }),
      headline: pick(['below', 'beside', 'hidden'] as const, 'below'),
      contact: z
        .object({
          layout: pick(['inline', 'stacked', 'grid-2'] as const, 'inline'),
          icons: flag(true),
        })
        .default({ layout: 'inline', icons: true }),
      photo: z
        .object({
          show: flag(true),
          shape: pick(['circle', 'rounded', 'square'] as const, 'rounded'),
          size: pick(['S', 'M', 'L'] as const, 'M'),
          position: pick(
            ['header-left', 'header-right', 'side-top', 'overlap'] as const,
            'header-right',
          ),
          ring: flag(false),
          /** No photo yet: show the initials in the photo's place, so a photo-led design keeps its
           * shape (audit D-06), or leave the place out. */
          fallback: pick(['none', 'initials'] as const, 'none'),
        })
        .default({
          show: true,
          shape: 'rounded',
          size: 'M',
          position: 'header-right',
          ring: false,
          fallback: 'none',
        }),
    })
    .default({
      style: 'plain',
      band: 'solid',
      align: 'left',
      name: { size: 'L', case: 'normal', weight: 700, twoTone: false, trackingEm: 0 },
      headline: 'below',
      contact: { layout: 'inline', icons: true },
      photo: {
        show: true,
        shape: 'rounded',
        size: 'M',
        position: 'header-right',
        ring: false,
        fallback: 'none',
      },
    }),
  headings: z
    .object({
      style: pick(HEADING_STYLES, 'rule-after'),
      case: pick(CASES, 'upper'),
      size: pick(['S', 'M', 'L'] as const, 'M'),
      weight: z
        .union([z.literal(500), z.literal(600), z.literal(700)])
        .catch(700)
        .default(700),
      color: pick(['accent', 'ink'] as const, 'accent'),
    })
    .default({ style: 'rule-after', case: 'upper', size: 'M', weight: 700, color: 'accent' }),
  sections: z
    .object({ container: pick(CONTAINERS, 'none'), divider: pick(DIVIDERS, 'none') })
    .default({ container: 'none', divider: 'none' }),
  entries: z
    .object({
      layout: pick(ENTRY_LAYOUTS, 'dates-right'),
      lead: pick(['role', 'organisation'] as const, 'role'),
      dateFormat: pick(DATE_FORMATS, 'MMM YYYY'),
    })
    .default({ layout: 'dates-right', lead: 'role', dateFormat: 'MMM YYYY' }),
  bullets: z
    .object({ marker: pick(MARKERS, 'disc'), color: pick(['accent', 'ink'] as const, 'accent') })
    .default({ marker: 'disc', color: 'accent' }),
  lists: z
    .object({
      skills: z
        .object({
          style: pick(SKILL_STYLES, 'tags'),
          columns: z
            .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
            .catch(2)
            .default(2),
        })
        .default({ style: 'tags', columns: 2 }),
      languages: z
        .object({ style: pick(['text', 'bars', 'dots'] as const, 'text') })
        .default({ style: 'text' }),
      compactColumns: z
        .union([z.literal(1), z.literal(2), z.literal(3)])
        .catch(1)
        .default(1),
    })
    .default({
      skills: { style: 'tags', columns: 2 },
      languages: { style: 'text' },
      compactColumns: 1,
    }),
  color: z
    .object({
      accent: hex.catch('#1f4e8c').default('#1f4e8c'),
      secondary: hex.optional().catch(undefined),
      mode: pick(COLOR_MODES, 'accent'),
      ink: pick(INKS, 'charcoal'),
    })
    .default({ accent: '#1f4e8c', mode: 'accent', ink: 'charcoal' }),
  type: z
    .object({
      pair: pick(FONT_PAIR_IDS, 'modern'),
      basePt: clamp(9.5, 12, 10.5),
      lineHeight: clamp(1.3, 1.6, 1.42),
    })
    .default({ pair: 'modern', basePt: 10.5, lineHeight: 1.42 }),
  spacing: z
    .object({
      density: pick(DENSITIES, 'balanced'),
      sectionGapPt: clamp(6, 28, 15),
      itemGapPt: clamp(3, 18, 9.5),
    })
    .default({ density: 'balanced', sectionGapPt: 15, itemGapPt: 9.5 }),
  decor: z
    .object({
      kind: z
        .enum([...DECOR_KINDS, ...SIGNATURE_DECOR] as [string, ...string[]])
        .catch('none')
        .default('none'),
      intensity: pick(['subtle', 'medium'] as const, 'subtle'),
    })
    .default({ kind: 'none', intensity: 'subtle' }),
  icons: z
    .object({ sections: flag(false), style: pick(['line', 'solid'] as const, 'line') })
    .default({ sections: false, style: 'line' }),
  furniture: z
    .object({
      pageNumbers: flag(true),
      runningHeader: flag(true),
      footer: pick(['none', 'name', 'contact'] as const, 'none'),
    })
    .default({ pageNumbers: true, runningHeader: true, footer: 'none' }),
  extras: z
    .object({
      qr: pick(['none', 'portfolio', 'linkedin'] as const, 'none'),
      referencesLine: flag(false),
    })
    .default({ qr: 'none', referencesLine: false }),
  /**
   * Graphic layouts (catalogue Part F): a poster header with a portrait standing on its edge, a
   * coloured band with a side rail, a full-height rail with the portrait at its top, or a patterned
   * cover. Set, it replaces the layout and header above; the person's colour, font, spacing and
   * paper still apply. Absent on every other design.
   */
  graphic: graphicSpec.optional().catch(undefined),
});

export type DesignSpecV2 = z.output<typeof designSpecV2>;
export type GraphicSpec = z.output<typeof graphicSpec>;
export type DesignSpecV2Input = z.input<typeof designSpecV2>;

/** Parse anything into a valid spec: unknown values fall back, numbers are clamped. */
export function parseSpec(raw: unknown): DesignSpecV2 {
  const r = designSpecV2.safeParse(raw ?? {});
  return r.success ? r.data : designSpecV2.parse({});
}

/**
 * Fields a catalogue design accepts while staying attached to its signature code (they are
 * what the v1 design settings could already change).
 */
export const OVERRIDABLE = [
  'page.size',
  'color.accent',
  'type.pair',
  'spacing.density',
  'header.photo.show',
  'header.align',
  'lists.skills.style',
] as const;
