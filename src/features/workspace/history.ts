import { routeInfo } from './routes';

/** Adding only the workspace marker must not fetch another server-rendered page (especially offline). */
export function replaceWorkspaceLocation(href: string, replace: (href: string) => void): void {
  const current = window.location.pathname + window.location.search + window.location.hash;
  const route = routeInfo(current);
  if (route && route.href === routeInfo(href)?.href) {
    // Next copies its internal history state and updates useSearchParams for a native call.
    window.history.replaceState(null, '', href);
  } else if (navigator.onLine === false) {
    // The service worker caches full navigations, not Next's RSC requests.
    window.location.replace(href);
  } else replace(href);
}
