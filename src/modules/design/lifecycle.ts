/**
 * The design catalogue as data (catalogue task, Part C). What a design *is* (how it draws) stays in
 * code; what the owner decides about it — whether it is live, its tags, its tier — lives in the
 * versioned business config and is edited in Admin → Designs.
 *
 * Status:
 *  - draft:   not shown anywhere and not usable (new designs start here).
 *  - live:    in the gallery, recommendations and the AI Designer.
 *  - retired: hidden from the gallery, recommendations and the AI Designer, but CVs that already
 *             use it keep rendering and exporting.
 */
import { DESIGN_IDS } from '@/modules/resume/ids';
import type { DesignId } from '@/modules/resume/schema';
import { DESIGN_META, type DesignMeta } from './designs';
import { designSpec } from './catalogue';
import { FIXTURES } from '@/modules/resume/fixtures';

export const DESIGN_STATUSES = ['draft', 'live', 'retired'] as const;
export type DesignStatus = (typeof DESIGN_STATUSES)[number];

/** Mood and occasion tags (owner-editable per design). */
export const DESIGN_TAGS = [
  'bold',
  'elegant',
  'minimal',
  'creative',
  'classic',
  'photo-led',
  'first-job',
  'senior',
  'academic',
] as const;
export type DesignTag = (typeof DESIGN_TAGS)[number];

export const TAG_LABEL: Record<DesignTag, string> = {
  bold: 'Bold',
  elegant: 'Elegant',
  minimal: 'Minimal',
  creative: 'Creative',
  classic: 'Classic',
  'photo-led': 'Photo-led',
  'first-job': 'First job',
  senior: 'Senior',
  academic: 'Academic',
};

/** Starting tags; the owner changes them in Admin → Designs. */
const DEFAULT_TAGS: Record<DesignId, DesignTag[]> = {
  clarity: ['minimal', 'first-job'],
  linea: ['minimal', 'elegant'],
  margin: ['minimal', 'elegant'],
  brief: ['minimal', 'senior'],
  heritage: ['classic', 'senior'],
  regent: ['classic', 'elegant', 'senior'],
  counsel: ['classic', 'senior'],
  scholar: ['classic', 'academic'],
  atelier: ['creative', 'elegant'],
  meridian: ['bold', 'senior'],
  harbor: ['elegant', 'first-job'],
  summit: ['bold', 'senior'],
  ledger: ['bold', 'senior'],
  folio: ['elegant', 'creative'],
  column: ['minimal', 'elegant'],
  press: ['elegant', 'academic'],
  chronicle: ['classic', 'first-job'],
  milestone: ['bold'],
  pathway: ['elegant', 'first-job'],
  route: ['minimal'],
  vivid: ['bold', 'creative'],
  sprout: ['creative', 'first-job'],
  spark: ['bold', 'creative', 'first-job'],
  pulse: ['bold', 'creative'],
  halo: ['photo-led', 'elegant'],
  lens: ['photo-led', 'minimal'],
  cameo: ['photo-led', 'classic'],
  aura: ['photo-led', 'bold'],
  grid: ['minimal', 'senior'],
  mosaic: ['senior', 'academic'],
  tiles: ['creative', 'first-job'],
  matrix: ['bold', 'senior'],
  neon: ['creative', 'bold', 'photo-led'],
  coral: ['creative', 'bold', 'photo-led'],
  ocean: ['creative', 'bold', 'photo-led'],
  emerald: ['creative', 'bold', 'photo-led'],
  magenta: ['creative', 'bold', 'photo-led'],
  citrus: ['creative', 'bold', 'photo-led'],
  cyber: ['creative', 'bold', 'photo-led'],
  ruby: ['creative', 'bold', 'photo-led'],
  blueprint: ['creative', 'bold', 'photo-led'],
  cobalt: ['creative', 'bold', 'photo-led'],
  violet: ['creative', 'elegant', 'photo-led'],
  terra: ['creative', 'elegant', 'photo-led'],
  graphite: ['creative', 'elegant', 'photo-led'],
  tangerine: ['creative', 'elegant', 'photo-led'],
  copper: ['creative', 'elegant', 'photo-led'],
  electric: ['creative', 'bold', 'photo-led'],
  solar: ['creative', 'bold', 'photo-led'],
  ultraviolet: ['creative', 'bold', 'photo-led'],
  aurora: ['creative', 'bold', 'photo-led'],
  chromatic: ['creative', 'bold', 'photo-led'],
} as Record<DesignId, DesignTag[]>;

export function defaultTags(id: DesignId): DesignTag[] {
  return [...(DEFAULT_TAGS[id] ?? [])];
}

/** Date each design entered the catalogue (from the repository history). */
export function defaultAddedAt(id: DesignId): string {
  return DESIGN_META[id]?.family === 'graphic' ? '2026-11-15' : '2026-11-13';
}

/**
 * "ATS-friendly": a single-column reading order, so the PDF itself reads cleanly in screening
 * software. "Creative": made to be looked at; its plain ATS version is the one for online forms.
 */
export type DesignLabel = 'ats' | 'creative';
const labelCache = new Map<DesignId, DesignLabel>();
export function designLabel(d: DesignMeta | DesignId): DesignLabel {
  const meta = typeof d === 'string' ? DESIGN_META[d] : d;
  const hit = labelCache.get(meta.id);
  if (hit) return hit;
  let out: DesignLabel = 'creative';
  if (meta.family !== 'graphic') {
    const t = designSpec(meta.id, FIXTURES.teacher.design).layout.type;
    if (t === 'single' || t === 'timeline') out = 'ats';
  }
  labelCache.set(meta.id, out);
  return out;
}

/** The owner-editable part of one design, as stored in the business config. */
export type DesignEntry = {
  id: DesignId;
  /** Kept in step with status for older readers: true exactly when status is "live". */
  enabled: boolean;
  status: DesignStatus;
  tier: 'free' | 'premium';
  isNew: boolean;
  tags: DesignTag[];
  addedAt: string;
};

/**
 * Fills fields a stored entry predates: status from the old on/off switch (on = live,
 * off = draft), default tags and date. `enabled` always follows status afterwards.
 */
export function normaliseEntry(raw: {
  id: DesignId;
  enabled: boolean;
  tier: 'free' | 'premium';
  isNew?: boolean;
  status?: DesignStatus;
  tags?: DesignTag[];
  addedAt?: string;
}): DesignEntry {
  // The two are always written together; when they disagree, only the on/off switch was changed
  // (by an older editor), so it wins: on = live, off = back to draft (retired stays retired).
  let status: DesignStatus = raw.status ?? (raw.enabled ? 'live' : 'draft');
  if (raw.enabled && status !== 'live') status = 'live';
  if (!raw.enabled && status === 'live') status = 'draft';
  return {
    id: raw.id,
    status,
    enabled: status === 'live',
    tier: raw.tier,
    isNew: raw.isNew ?? false,
    tags: raw.tags ? [...new Set(raw.tags)] : defaultTags(raw.id),
    addedAt: raw.addedAt ?? defaultAddedAt(raw.id),
  };
}

/** Shown in the gallery, recommendations, makeover and the AI Designer (`enabled` follows status). */
export const isLive = (e: { enabled: boolean } | undefined): boolean => !!e && e.enabled;

/** A CV that already uses this design may keep rendering and exporting it. */
export const keepsWorking = (e: { status?: DesignStatus; enabled: boolean } | undefined): boolean =>
  !!e && (e.enabled || e.status === 'retired');

export const ALL_DESIGN_IDS = DESIGN_IDS;
