/** Search-engine and link-preview helpers (pure; nothing here touches data or app logic). */

/** The site's own address; staging sets PUBLIC_SITE_URL to its own. */
export const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://aicvstudio.app').replace(
  /\/$/,
  '',
);

/** Only the real site is allowed to be indexed; staging and previews never are. */
export const IS_PRODUCTION_SITE = SITE_URL === 'https://aicvstudio.app';

export const OG_IMAGE = { url: '/og/default.png', width: 1200, height: 630 } as const;

/** JSON-LD for a <script type="application/ld+json">; "<" is escaped so content cannot end the tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
