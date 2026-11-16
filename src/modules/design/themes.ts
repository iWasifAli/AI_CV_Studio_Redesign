/**
 * Colour themes (catalogue Part B): every design can be shown and used in a few curated palettes.
 * A design's own colours are always the first theme. For most designs a theme is the accent colour;
 * the graphic designs also take its dark and pale tones (their header and panels).
 */
import { DATA_GRAPHIC_TONES, SIGNATURE_ACCENT } from './designs';
import { BAND, COVER, RAIL, SPOT } from '@/modules/templates/graphic/catalog';
import type { DesignId, ResumeDocument } from '@/modules/resume/schema';
import { ops } from '@/modules/resume/ops';

export type Theme = { id: string; name: string; accent: string; ink: string; soft: string };

/** Curated palettes. Accents are dark enough for text on white (checked in themes.test.ts). */
export const THEMES: Theme[] = [
  { id: 'navy', name: 'Navy', accent: '#1e4f7a', ink: '#14263b', soft: '#e8f0f8' },
  { id: 'forest', name: 'Forest', accent: '#2f6b4f', ink: '#183a2c', soft: '#e9f5ee' },
  { id: 'plum', name: 'Plum', accent: '#6b3a75', ink: '#2f1d38', soft: '#f4ecf6' },
  { id: 'rust', name: 'Rust', accent: '#a8471f', ink: '#3a2018', soft: '#fbeee6' },
  { id: 'teal', name: 'Teal', accent: '#0f766e', ink: '#113f4b', soft: '#e6f6f4' },
  { id: 'graphite', name: 'Graphite', accent: '#44505c', ink: '#1f262d', soft: '#eef1f4' },
];

const GRAPHIC_TONES = new Map<string, { ink: string; soft: string }>(
  [...SPOT, ...BAND, ...RAIL, ...COVER].map((c) => [c.id, { ink: c.ink, soft: c.soft }]),
);
export const isGraphic = (id: string) => id in SIGNATURE_ACCENT;

/** The design's own colours as a theme (graphic designs have a signature palette). */
export function ownTheme(id: DesignId, doc?: ResumeDocument): Theme {
  const g = SIGNATURE_ACCENT[id];
  const tones = GRAPHIC_TONES.get(id) ?? DATA_GRAPHIC_TONES[id];
  return {
    id: 'own',
    name: 'Its own colours',
    accent: g ?? doc?.design.accent ?? '#1f4e8c',
    ink: tones?.ink ?? '#1f2a37',
    soft: tones?.soft ?? '#eef2f6',
  };
}

export function themesFor(id: DesignId, doc?: ResumeDocument): Theme[] {
  return [ownTheme(id, doc), ...THEMES];
}

export const themeById = (id: string | undefined) => THEMES.find((t) => t.id === id);

/**
 * The CV in a design and theme. "own" (or no theme) is exactly `ops.useDesign` — so a saved CV
 * opens as before. A theme sets the colour as the person's own choice, and for graphic designs
 * also the dark and pale tones.
 */
export function inTheme(doc: ResumeDocument, themeId?: string): ResumeDocument {
  const t = themeById(themeId);
  if (!t) return doc;
  const designId = doc.design.v2?.designId ?? doc.design.templateId;
  const next = ops.setDesign(doc, { accent: t.accent }, 'person');
  return isGraphic(designId)
    ? {
        ...next,
        design: { ...next.design, palette: { theme: t.id, ink: t.ink, soft: t.soft } },
      }
    : next;
}
