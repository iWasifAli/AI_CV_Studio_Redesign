import { DEFAULT_CONFIG } from '../../src/modules/billing/config';

/** Designs live in a fresh studio (built-in designs minus those the owner retired). */
export const LIVE_DESIGNS = DEFAULT_CONFIG.designs.filter((d) => d.enabled).length;
