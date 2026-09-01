/**
 * Service worker (BUILD_PLAN §9.6).
 *
 * Precaches the app shell and the briefing content so the map, the visitor
 * journey and the five things work with no network — those are the screens a
 * volunteer needs in a stairwell or a dead spot, and they never change during a
 * shift.
 *
 * It deliberately does NOT cache API responses. A stale count is worse than an
 * absent count: a volunteer shown yesterday's booth total will trust it, and a
 * dashboard showing a station as busy when it went quiet an hour ago defeats
 * the entire data-health panel. Every /api/ request goes to the network, and
 * fails honestly when the network is not there.
 */

const CACHE = 'spoh2027-shell-v1';

const SHELL = ['/', '/home', '/map', '/journey', '/brief', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Individual failures must not abort the whole install: a missing icon
      // should not leave the volunteer with no offline shell at all.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache the API. See the note above — this is the load-bearing rule.
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) return;

  // Network first, falling back to the cached shell. A volunteer on a working
  // connection always sees the current build; one in a stairwell still gets the
  // map.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match('/home'))),
  );
});
