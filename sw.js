const CACHE_NAME = 'bpars-v59';
const CACHE_PREFIX = 'bpars-';
const APP_SCOPE = self.registration.scope;
const INDEX_URL = new URL('index.html', APP_SCOPE).href;

// Cache only the app shell and static, same-origin assets. Never cache API or
// user-specific responses.
const PRECACHE_URLS = [
  INDEX_URL,
  new URL('manifest.json', APP_SCOPE).href,
  new URL('icon-192.png', APP_SCOPE).href,
  new URL('icon-512.png', APP_SCOPE).href,
  new URL('logo-bpars.svg', APP_SCOPE).href
];
const STATIC_PATHS = new Set(PRECACHE_URLS.map((url) => new URL(url).pathname));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // Fail installation if a required app-shell file is missing. This avoids
      // activating a worker that cannot provide the expected offline shell.
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  // Leave external requests (including Google Apps Script/API calls) entirely
  // to the browser. The worker must not cache data or cross-origin responses.
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const isAppEntry = requestUrl.pathname === new URL(APP_SCOPE).pathname ||
          requestUrl.pathname === new URL(INDEX_URL).pathname;

        if (
          isAppEntry &&
          response.status === 200 &&
          response.type === 'basic' &&
          !response.redirected &&
          !/no-store/i.test(response.headers.get('Cache-Control') || '')
        ) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(INDEX_URL, response.clone());
        }
        return response;
      } catch (error) {
        const cachedIndex = await caches.match(INDEX_URL);
        if (cachedIndex) return cachedIndex;
        throw error;
      }
    })());
    return;
  }

  // Restrict runtime caching to the explicit app-shell asset allowlist. This
  // prevents accidental caching of same-origin API or personalized responses.
  if (!STATIC_PATHS.has(requestUrl.pathname)) return;

  const cacheUrl = new URL(request.url);
  cacheUrl.search = '';
  cacheUrl.hash = '';
  const cacheKey = cacheUrl.href;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) return cachedResponse;

    const response = await fetch(request);
    if (
      response.status === 200 &&
      response.type === 'basic' &&
      !response.redirected &&
      !/no-store/i.test(response.headers.get('Cache-Control') || '')
    ) {
      await cache.put(cacheKey, response.clone());
    }
    return response;
  })());
});
