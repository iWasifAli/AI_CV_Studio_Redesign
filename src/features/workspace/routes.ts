const destinations: Record<string, string> = {
  studio: 'Home',
  documents: 'Documents',
  start: 'New CV',
  cv: 'CV',
  profile: 'Career profile',
  makeover: 'CV makeover',
  jobs: 'Jobs',
  letters: 'Letters',
  templates: 'Designs',
  presence: 'Presence',
  portfolio: 'Portfolio',
  linkedin: 'LinkedIn',
  coach: 'Coach',
  skills: 'Skills',
  stories: 'Stories',
};
export const WORKSPACE_PARAM = '_workspace';

/** Same-origin app paths only. Auth, public, admin and settings never enter restored workspaces. */
export function routeInfo(
  href: string,
): { href: string; title: string; entityKey: string | null } | null {
  if (!href.startsWith('/') || href.startsWith('//') || href.includes('\\')) return null;
  try {
    const url = new URL(href, 'https://workspace.invalid');
    const parts = url.pathname.split('/').filter(Boolean);
    const title = destinations[parts[0] ?? ''];
    if (!title || href.length > 4096) return null;
    url.searchParams.delete(WORKSPACE_PARAM);
    return {
      href: url.pathname + url.search + url.hash,
      title,
      entityKey: entityKey(url.pathname),
    };
  } catch {
    return null;
  }
}
export function entityKey(href: string): string | null {
  const path = href.split(/[?#]/)[0] ?? '';
  const parts = path.split('/').filter(Boolean);
  if (
    ['cv', 'jobs', 'letters'].includes(parts[0] ?? '') &&
    parts[1] &&
    !['new', 'import', 'insights'].includes(parts[1])
  )
    return `${parts[0]}:${parts[1]}`;
  if (['profile', 'portfolio', 'coach'].includes(parts[0] ?? '') && parts.length === 1)
    return parts[0]!;
  return null;
}
export function workspaceHref(href: string, tabId: string): string {
  const route = routeInfo(href);
  if (!route) return href;
  const url = new URL(route.href, 'https://workspace.invalid');
  url.searchParams.set(WORKSPACE_PARAM, tabId);
  return url.pathname + url.search + url.hash;
}
export function routeScope(href: string): string {
  const url = new URL(href, 'https://workspace.invalid');
  for (const key of [WORKSPACE_PARAM, 'tab', 'focus', 'welcome']) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.pathname + url.search;
}
