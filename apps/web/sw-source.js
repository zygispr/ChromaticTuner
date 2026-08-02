/**
 * Offline-first service worker (FR-030, SC-011).
 *
 * Everything the app needs is precached on install, so a cold reload with no
 * network — including the very first launch after installing to the home
 * screen — starts a working tuner. There is nothing to fetch at runtime anyway:
 * all analysis happens on the device, and the app has no backend (FR-031/032).
 *
 * `__PRECACHE_MANIFEST__` and `__CACHE_VERSION__` are replaced at build time by
 * the `precache` plugin in vite.config.ts, which reads the real emitted file
 * names. Hand-maintaining that list would silently rot the moment a chunk hash
 * changed — and the failure mode is an app that looks fine online and is broken
 * offline, which is exactly the case nobody tests by accident.
 */
const CACHE = __CACHE_VERSION__;
const PRECACHE = __PRECACHE_MANIFEST__;

/**
 * `ignoreVary` is not optional here, and getting it wrong is invisible online.
 *
 * The Cache API honours a stored response's `Vary` header when matching. Static
 * hosts routinely serve assets with `Vary: Origin` (Vite's preview server does),
 * and the `Origin` header a module script sends does not match the one the
 * install-time `addAll` fetch sent — so every precached asset misses, falls
 * through to the network, and the app is blank the moment there isn't one.
 * The precache list is keyed by URL and nothing about these assets varies by
 * request header, so matching on URL alone is both safe and what was meant.
 */
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // Take over immediately: the tuner has no multi-tab state to protect, and
      // waiting means the first visit is not actually offline-capable.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // A navigation to any in-scope URL is the same single-page app shell, so it
  // is served from the cached index rather than the network.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html', MATCH).then((cached) => cached ?? fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request, MATCH).then((cached) => {
      if (cached) return cached;
      // Not precached: try the network, and fail honestly if there is none.
      // Nothing on this path is required for tuning.
      return fetch(request);
    })
  );
});
