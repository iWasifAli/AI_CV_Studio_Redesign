import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('seo helpers', () => {
  it('escapes "<" in structured data so it cannot close the script tag', async () => {
    const { jsonLd } = await import('./seo');
    const out = jsonLd({ name: '</script><b>x' });
    expect(out).not.toContain('<');
    expect(JSON.parse(out).name).toBe('</script><b>x');
  });

  it('the real site is open to crawlers and points at its sitemap', async () => {
    vi.stubEnv('PUBLIC_SITE_URL', '');
    const robots = (await import('../app/robots')).default();
    expect(JSON.stringify(robots)).toContain('https://aicvstudio.app/sitemap.xml');
    expect(JSON.stringify(robots)).not.toContain('"disallow":"/"');
  });

  it('staging is closed to every crawler', async () => {
    vi.stubEnv('PUBLIC_SITE_URL', 'https://aicvstudio-staging--x.hosted.app');
    const robots = (await import('../app/robots')).default();
    expect(robots.rules).toEqual({ userAgent: '*', disallow: '/' });
    expect(JSON.stringify(robots)).not.toContain('sitemap');
  });

  it('the sitemap lists the home page, the tools and every live design once', async () => {
    vi.stubEnv('PUBLIC_SITE_URL', '');
    const { default: sitemap } = await import('../app/sitemap');
    const { DEFAULT_CONFIG } = await import('../modules/billing/config');
    const { isLive } = await import('../modules/design/lifecycle');
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain('https://aicvstudio.app');
    expect(urls).toContain('https://aicvstudio.app/templates');
    expect(urls).toContain('https://aicvstudio.app/cv-for/drivers');
    const live = DEFAULT_CONFIG.designs.filter(isLive);
    for (const d of live) expect(urls).toContain(`https://aicvstudio.app/templates/${d.id}`);
    expect(new Set(urls).size).toBe(urls.length);
    // Retired designs and signed-in pages stay out.
    expect(urls.some((u) => u.endsWith('/templates/column'))).toBe(false);
    expect(urls.some((u) => /\/(account|documents|admin|cv)(\/|$)/.test(u))).toBe(false);
  });
});
