/* Bioluma service worker.
 *
 * Small and conservative:
 *  - precaches the app shell ('.' and index.html) plus the same-origin assets index.html references,
 *  - navigation requests: network first, fall back to the cached shell when offline,
 *  - other same-origin GET requests: cache first (Vite assets are content-hashed, so this is safe);
 *    files without a hash (icons, manifest) are served from cache and refreshed in the background,
 *  - never touches cross-origin requests (Google Fonts, analytics), non-GET requests or Range requests,
 *  - old caches are deleted on activate.
 *
 * Bump CACHE_VERSION when shipping a release that must not reuse old cached files. The page registers
 * this worker only on http(s) origins (never from file://, e.g. the single-file build).
 */
const CACHE_VERSION = 'bioluma-v2';
const CACHE_PREFIX = 'bioluma-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

const SCOPE = new URL('./', self.location.href);
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png'];

/** Vite emits content-hashed files such as assets/index-3f9a1c2b.js. */
const HASHED = /[-.][A-Za-z0-9_-]{8}\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|json|wasm)$/;

const sameOrigin = (url) => url.origin === self.location.origin;

/** Same-origin URLs that index.html pulls in (scripts, styles, modulepreload, icons). */
function referencedAssets(html) {
  const urls = new Set();
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1], SCOPE);
      if (sameOrigin(u) && u.pathname.startsWith(SCOPE.pathname) && !u.hash) urls.add(u.href);
    } catch {
      /* ignore malformed urls */
    }
  }
  return [...urls];
}

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  // Individual adds: one missing file must not make the whole install fail.
  await Promise.allSettled(SHELL.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
  try {
    const res = await fetch(new Request('./index.html', { cache: 'reload' }));
    if (res.ok) {
      const html = await res.clone().text();
      await Promise.allSettled(referencedAssets(html).map((u) => cache.add(new Request(u, { cache: 'reload' }))));
      await cache.put(new Request('./index.html'), res);
    }
  } catch {
    /* offline during install: the shell added above is enough */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
  // No automatic skipWaiting: a new worker takes over when the app is closed, or when the page asks for it.
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match('./index.html')) ||
      (await cache.match('./'));
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, revalidate) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const refresh = () =>
    fetch(request)
      .then((res) => {
        if (res.ok && res.type === 'basic') cache.put(request, res.clone());
        return res;
      })
      .catch(() => undefined);
  if (cached) {
    if (revalidate) refresh();
    return cached;
  }
  const res = await refresh();
  if (res) return res;
  return Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (!sameOrigin(url)) return;
  // Live data (ranking API) must never be served from cache.
  if (url.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request, !HASHED.test(url.pathname)));
});
