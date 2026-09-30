/**
 * Service worker (BUILD_PLAN §9.6).
 *
 * Precaches the app shell, the briefing content, My shift and the capture
 * screens, with the scripts and styles each of them loads, so a volunteer who
 * first opens a capture screen while the venue Wi-Fi is down still gets it
 * (F03-036). The map, the visitor journey and the five things are what a
 * volunteer needs in a stairwell or a dead spot.
 *
 * It deliberately does NOT cache API responses. A stale count is worse than an
 * absent count: a volunteer shown yesterday's booth total will trust it, and a
 * dashboard showing a station as busy when it went quiet an hour ago defeats
 * the entire data-health panel. Every /api/ request goes to the network, and
 * fails honestly when the network is not there.
 */

/**
 * One cache per build. The page registers `/sw.js?v=<build id>`, so a new
 * build installs a new worker, and activate drops the last build's chunks
 * instead of letting every past build accumulate.
 */
const VERSION = new URLSearchParams(self.location.search || '').get('v') || 'dev';
const CACHE = `spoh2027-shell-${VERSION}`;

/**
 * Event screens live at `/e/<slug>/…`, and every slug is served from the one
 * exported placeholder `/e/_/…` (ADR-008 §2). So the worker precaches the
 * placeholder and files any event's page under it: a volunteer offline in any
 * event gets the same shell, which reads its event from the address.
 */
const EVENT_SEGMENT = /^\/e\/[^/]+/;
const PLACEHOLDER = '/e/_';

function cacheKeyOf(url) {
  return url.pathname.replace(EVENT_SEGMENT, PLACEHOLDER) + url.search;
}

const SHELL = [
  '/',
  '/events',
  `${PLACEHOLDER}/home`,
  `${PLACEHOLDER}/map`,
  `${PLACEHOLDER}/journey`,
  `${PLACEHOLDER}/brief`,
  `${PLACEHOLDER}/shift`,
  `${PLACEHOLDER}/capture/registration`,
  `${PLACEHOLDER}/capture/registration/group`,
  `${PLACEHOLDER}/capture/footfall`,
  `${PLACEHOLDER}/capture/stamp`,
  `${PLACEHOLDER}/capture/redeem`,
  '/manifest.json',
];

/**
 * Hashed build assets: immutable, so a cached copy is always the right one.
 * The backslash is excluded because pages also name chunks inside inline RSC
 * JSON, where the closing quote is escaped.
 */
const STATIC_ASSET = /\/_next\/static\/[^"'\s)\\]+/g;

/** The scripts and styles a cached page names, so the page runs offline too. */
function assetsOf(cache, url) {
  return cache
    .match(url)
    .then((response) => (response ? response.text() : ''))
    .then((html) => [...new Set(html.match(STATIC_ASSET) || [])]);
}

function precache(cache) {
  // Individual failures must not abort the whole install: a missing icon
  // should not leave the volunteer with no offline shell at all.
  return Promise.allSettled(SHELL.map((url) => cache.add(url)))
    .then(() => Promise.all(SHELL.map((url) => assetsOf(cache, url).catch(() => []))))
    .then((lists) => [...new Set(lists.flat())])
    .then((assets) => Promise.allSettled(assets.map((url) => cache.add(url))));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(precache)
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

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(fromCacheFirst(request));
    return;
  }

  // Network first, falling back to the cached shell. A volunteer on a working
  // connection always sees the current build; one in a stairwell still gets the
  // map.
  const key = cacheKeyOf(url);
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(key, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(key).then((cached) => cached ?? caches.match(`${PLACEHOLDER}/home`)),
      ),
  );
});

function fromCacheFirst(request) {
  return caches.match(request).then(
    (cached) =>
      cached ??
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }),
  );
}

/**
 * Push (RFC 8030).
 *
 * The payload is written by `server/src/modules/notification/service.ts` and
 * deliberately carries no personal data — not the lost-person description, not
 * an incident's free text. A notification is copied into the operating system's
 * own history, where the 24-hour purge cannot reach it.
 *
 * `tag` collapses repeats: a resolution replaces the alert it resolves rather
 * than stacking underneath it, which is what stops six notifications about one
 * event teaching people to swipe them all away.
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // Anything we cannot parse is not ours. Showing "undefined" would be worse
    // than showing nothing.
    return;
  }

  const title = payload.title || 'SPOH Ops';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      tag: payload.tag,
      // Replace silently rather than re-alerting for a collapse of the same tag.
      renotify: payload.priority === 'URGENT',
      requireInteraction: payload.priority === 'URGENT',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url || '/', kind: payload.kind },
    }),
  );
});

/**
 * Focus an open tab rather than opening a second one.
 *
 * A volunteer with four copies of the ops app open is a volunteer who will act
 * on whichever one happens to be stalest.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = new URL(event.notification.data?.url || '/', self.location.origin);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin !== target.origin) continue;
        return client.focus().then((focused) => focused.navigate(target.href));
      }
      return self.clients.openWindow(target.href);
    }),
  );
});

/**
 * A push service may rotate a subscription without the page being open.
 *
 * Re-subscribing here keeps the browser side alive. The server is NOT told from
 * here: this worker holds no access token — the whole point of keeping the
 * token in memory is that nothing persistent can reach it — so any request it
 * made would be an unauthenticated 401. Instead it tells every open window,
 * and the app re-registers the new endpoint with the API (F03-035). With no
 * window open, the app notices the changed endpoint on its next load.
 *
 * Until then this device is in the same position as one with push switched off:
 * it still receives every alert through the ten-second poll while the app is
 * open, which is the delivery guarantee either way.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription?.options ?? { userVisibleOnly: true })
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((windows) => {
        for (const client of windows) client.postMessage({ type: 'push-subscription-changed' });
      })
      .catch(() => undefined),
  );
});
