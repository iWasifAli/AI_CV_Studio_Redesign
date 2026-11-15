/*
 * AI CV Studio service worker (spec §11.5): makes the studio installable and keeps an offline
 * shell. Pages are network-first (always fresh when online) and the last copy of each page you
 * opened is kept for offline use. Built files, fonts and icons never change once published, so
 * they are cache-first. The API, sign-in and the Console are never cached.
 */
const VERSION = 'v1';
const PAGES = `pages-${VERSION}`;
const STATIC = `static-${VERSION}`;
const OFFLINE = '/offline';
const MAX_PAGES = 40;

/** The offline page and the built files it needs, so it works fully without a connection. */
async function precache() {
  const pages = await caches.open(PAGES);
  const res = await fetch(OFFLINE, { cache: 'no-store' });
  if (!res.ok) return;
  await pages.put(OFFLINE, res.clone());
  await pages.add('/icons/icon-192.png');
  const html = await res.text();
  const files = [...new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) ?? [])];
  const assets = await caches.open(STATIC);
  await Promise.all(files.map((f) => assets.add(f).catch(() => {})));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precache()
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== PAGES && k !== STATIC).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

const NEVER = /^\/(api|admin|signin|r)(\/|$)/;

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_PAGES; i++) await cache.delete(keys[i]);
}

async function page(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (res.ok && res.type === 'basic' && !res.headers.get('content-disposition')) {
      await cache.put(request, res.clone());
      trim(cache);
    }
    return res;
  } catch {
    const url = new URL(request.url);
    return (
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match(url.pathname)) ||
      (await cache.match(OFFLINE)) ||
      new Response('You are offline.', { status: 503, headers: { 'content-type': 'text/plain' } })
    );
  }
}

async function asset(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || NEVER.test(url.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(page(request));
    return;
  }
  if (/^\/(_next\/static|fonts|icons)\//.test(url.pathname)) event.respondWith(asset(request));
});
