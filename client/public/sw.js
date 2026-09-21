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
      data: { url: payload.url || '/home', kind: payload.kind },
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

  const target = new URL(event.notification.data?.url || '/home', self.location.origin);

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
 * here on purpose: this worker holds no access token — the whole point of
 * keeping the token in memory is that nothing persistent can reach it — so any
 * request it made would be an unauthenticated 401. The page re-registers the
 * new endpoint on its next load, which is also when a volunteer could act on
 * the gap if there were one.
 *
 * Until then this device is in the same position as one with push switched off:
 * it still receives every alert through the ten-second poll while the app is
 * open, which is the delivery guarantee either way.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription?.options ?? { userVisibleOnly: true })
      .catch(() => undefined),
  );
});
