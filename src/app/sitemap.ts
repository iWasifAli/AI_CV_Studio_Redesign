import type { MetadataRoute } from 'next';
import { DEFAULT_CONFIG } from '@/modules/billing/config';
import { isLive } from '@/modules/design/lifecycle';
import { SITE_URL } from '@/lib/seo';
import { GUIDES } from '@/features/guides/guides';

/** The public pages worth finding: the home page, the main tools, and one page per live design. */
export const PUBLIC_PATHS = [
  '/',
  '/templates',
  '/start',
  '/makeover',
  '/cv-for',
  '/premium',
  '/portfolio',
  '/linkedin',
  '/help',
  '/privacy',
  '/terms',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const designs = DEFAULT_CONFIG.designs.filter(isLive).map((d) => `/templates/${d.id}`);
  const guides = GUIDES.map((g) => `/cv-for/${g.slug}`);
  return [...PUBLIC_PATHS, ...guides, ...designs].map((p) => ({
    url: `${SITE_URL}${p === '/' ? '' : p}`,
    priority: p === '/' ? 1 : p === '/templates' || p === '/start' ? 0.8 : 0.5,
  }));
}
