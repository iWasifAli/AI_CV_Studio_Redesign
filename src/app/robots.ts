import type { MetadataRoute } from 'next';
import { IS_PRODUCTION_SITE, SITE_URL } from '@/lib/seo';

/**
 * Staging and previews are closed to crawlers. The real site is open, except for the API and the
 * pages that only make sense signed in (those also say `noindex` themselves).
 */
export default function robots(): MetadataRoute.Robots {
  if (!IS_PRODUCTION_SITE) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/admin', '/auth/', '/r/', '/s/'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
