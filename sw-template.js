/* Service worker: makes the app load offline. Generated at build time by vite.config.ts. */
const VERSION = '__VERSION__';
const PRECACHE = __ASSETS__;
const PREFIX = 'habit-tracker-';
const CACHE = PREFIX + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./', ...PRECACHE]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      // Keep the previous version too, so a page that is still open can load its lazy chunks.
      const old = keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).sort().reverse();
      return Promise.all(old.slice(1).map((k) => caches.delete(k)));
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Downloads (the Claude Desktop extension) always come fresh from the server and are never cached.
  if (url.pathname.includes('/mcp/')) return;

  if (request.mode === 'navigate') {
    // Network first for the page itself so updates arrive; cached copy when offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('./', copy));
          }
          return response;
        })
        .catch(() => caches.match('./').then((hit) => hit || Response.error())),
    );
    return;
  }

  // Build assets have content hashes in their names, so cache first is safe.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
