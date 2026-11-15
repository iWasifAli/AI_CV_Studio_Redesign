import type { Dict, Lang } from './core';
import { de } from './de';

/** Dictionaries by language; English needs none (the source text is English). */
export const DICTS: Record<Lang, Dict | null> = { en: null, de };
