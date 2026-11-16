/**
 * Designs as data (catalogue Part F): a design file holds everything about a design — what it is
 * called, whom it suits, its tags and its look as a Design Spec. No layout code is written for a
 * new design; the composer draws it from the spec (including the graphic layouts).
 */
import { z } from 'zod';
import { FONT_PAIR_IDS, TEMPLATE_IDS } from '@/modules/resume/ids';
import { PRESET_IDS } from '@/modules/resume/professions';
import { ops } from '@/modules/resume/ops';
import type { ResumeDocument } from '@/modules/resume/schema';
import { FAMILIES } from './designs';
import { DESIGN_STATUSES, DESIGN_TAGS } from './lifecycle';
import { designSpecV2, parseSpec, type DesignSpecV2 } from './spec';

export const dataDesignFile = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,23}$/, 'Lower-case letters, digits and dashes'),
  name: z.string().min(2).max(24),
  style: z.string().min(2).max(40),
  description: z.string().min(10).max(200),
  family: z.enum(FAMILIES),
  fontPair: z.enum(FONT_PAIR_IDS),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fit: z.partialRecord(z.enum(PRESET_IDS), z.number().min(0).max(1)).default({}),
  photo: z.boolean(),
  tags: z.array(z.enum(DESIGN_TAGS)).min(1).max(4),
  /** Hand-crafted design used where only a classic design can be used (Word export, letters). */
  fallback: z.enum(TEMPLATE_IDS),
  /** New designs start as drafts: the owner switches them live in Admin → Designs. */
  status: z.enum(DESIGN_STATUSES).default('draft'),
  /** Date it entered the catalogue (YYYY-MM-DD), for "Newest". */
  addedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  spec: z.unknown(),
});
export type DataDesignFile = z.output<typeof dataDesignFile>;

/** Reads a design file strictly: every spec value must be valid (no silent fallbacks). */
export function readDataDesign(
  raw: unknown,
): { ok: true; file: DataDesignFile; spec: DesignSpecV2 } | { ok: false; errors: string[] } {
  const f = dataDesignFile.safeParse(raw);
  if (!f.success)
    return { ok: false, errors: f.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  const strict = designSpecV2.safeParse(f.data.spec);
  if (!strict.success)
    return {
      ok: false,
      errors: strict.error.issues.map((i) => `spec.${i.path.join('.')}: ${i.message}`),
    };
  const spec = parseSpec(f.data.spec);
  // parseSpec falls back silently on bad values; a design file must not rely on that.
  const g = (f.data.spec as { graphic?: unknown })?.graphic;
  if (g && !spec.graphic)
    return { ok: false, errors: ['spec.graphic: not a valid graphic layout'] };
  return {
    ok: true,
    file: f.data,
    spec: {
      ...spec,
      color: { ...spec.color, accent: f.data.accent },
      type: { ...spec.type, pair: f.data.fontPair },
    },
  };
}

/** A CV drawn in a data design (for previews, tests and the authoring kit). */
export function inDataDesign(
  doc: ResumeDocument,
  file: DataDesignFile,
  spec: DesignSpecV2,
): ResumeDocument {
  const withLook = ops.setDesign(doc, { accent: file.accent, fontPair: file.fontPair }, 'design');
  return ops.setSpec(withLook, spec);
}
