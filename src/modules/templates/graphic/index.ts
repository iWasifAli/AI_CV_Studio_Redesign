import type { CatalogueTemplate } from '../types';
import { BAND, COVER, RAIL, SPOT } from './catalog';
import { coverTemplate } from './cover';
import { railTemplate } from './rail';
import { bandTemplate } from './band';
import { spotTemplate } from './spot';
import type { GRAPHIC_META } from './meta';

/** The graphic designs as catalogue templates, by id. */
export const GRAPHIC_TEMPLATES = Object.fromEntries([
  ...SPOT.map((c) => [c.id, spotTemplate(c)]),
  ...BAND.map((c) => [c.id, bandTemplate(c)]),
  ...RAIL.map((c) => [c.id, railTemplate(c)]),
  ...COVER.map((c) => [c.id, coverTemplate(c)]),
]) as Record<keyof typeof GRAPHIC_META, CatalogueTemplate>;
