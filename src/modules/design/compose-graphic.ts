/**
 * The graphic layouts as composer building blocks (catalogue Part F). A spec with a `graphic`
 * block is drawn by the block's layout — poster header, band with side rail, full-height rail or
 * patterned cover — configured entirely by the spec's values. A new graphic design is therefore
 * a data file; no layout code is written for it.
 */
import { bandTemplate } from '@/modules/templates/graphic/band';
import { coverTemplate } from '@/modules/templates/graphic/cover';
import { railTemplate } from '@/modules/templates/graphic/rail';
import { spotTemplate } from '@/modules/templates/graphic/spot';
import type { TemplateDefinition } from '@/modules/templates/types';
import type { TemplateId } from '@/modules/resume/schema';
import type { DesignSpecV2, GraphicSpec } from './spec';

/** The spec's graphic block as the layout's own settings (field names differ per layout). */
export function graphicConfig(s: DesignSpecV2, g: GraphicSpec) {
  const base = {
    // The composed design is not a catalogue template; the id only names it in the page.
    id: 'custom' as unknown as TemplateId,
    name: 'My design',
    description: 'A design made from your own choices.',
    style: 'Custom',
    tags: [] as string[],
    fontPair: s.type.pair,
    ink: g.ink,
    soft: g.soft,
    marker: g.marker,
    skills: g.skills,
  };
  switch (g.layout) {
    case 'poster':
      return {
        layout: g.layout,
        cfg: {
          ...base,
          portrait: g.frame,
          art: g.art,
          numbers: g.numbers,
          side: g.side,
          caps: g.caps,
          stop: g.stop,
        },
      } as const;
    case 'band':
      return {
        layout: g.layout,
        cfg: {
          ...base,
          photo: g.frame,
          art: g.art,
          numbers: g.numbers,
          caps: g.caps,
          stop: g.stop,
          end: g.end,
          railMm: g.railMm,
        },
      } as const;
    case 'rail':
      return {
        layout: g.layout,
        cfg: {
          ...base,
          photo: g.frame,
          panel: g.art,
          ornament: g.ornament,
          nameStyle: g.nameStyle,
          railMm: g.railMm,
        },
      } as const;
    case 'cover':
      return {
        layout: g.layout,
        cfg: {
          ...base,
          frame: g.frame,
          pattern: g.art,
          side: g.side,
          caps: g.caps,
          stop: g.stop,
        },
      } as const;
  }
}

export function composeGraphic(s: DesignSpecV2, g: GraphicSpec): TemplateDefinition {
  const c = graphicConfig(s, g);
  const t =
    c.layout === 'poster'
      ? spotTemplate(c.cfg)
      : c.layout === 'band'
        ? bandTemplate(c.cfg)
        : c.layout === 'rail'
          ? railTemplate(c.cfg)
          : coverTemplate(c.cfg);
  return { ...t, id: 'custom' };
}
