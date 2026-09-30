import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

/**
 * P03 bug reproductions: the service worker (public/sw.js). It runs in a
 * sandbox with a fake `self`, which is enough to fire its install and
 * pushsubscriptionchange handlers. Skipped until fixed (P07); each asserts the
 * correct behaviour and fails today.
 */

type Handler = (
  event: { waitUntil(promise: Promise<unknown>): void } & Record<string, unknown>,
) => void;

// A prerendered page also names its chunks inside inline RSC JSON, with escaped quotes.
const PAGE =
  '<script src="/_next/static/chunks/app-1a2b.js"></script><link href="/_next/static/css/ui-9f.css">' +
  '<script>self.__next_f.push([1,"[\\"/_next/static/chunks/rsc-3c4d.js\\"]"])</script>';

function loadWorker(search = '') {
  const handlers = new Map<string, Handler>();
  const added: string[] = [];
  const opened: string[] = [];
  const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
  const cache = {
    add: vi.fn((url: string) => (added.push(url), Promise.resolve())),
    put: vi.fn(),
    // A precached route answers with a page that names its build's assets.
    match: vi.fn((url: string) =>
      Promise.resolve(url.startsWith('/_next/') ? undefined : new Response(PAGE)),
    ),
  };
  const posted: unknown[] = [];
  const matched: string[] = [];
  const self = {
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    clients: {
      matchAll: vi.fn(() =>
        Promise.resolve([{ postMessage: (message: unknown) => posted.push(message) }]),
      ),
    },
    skipWaiting: () => Promise.resolve(),
    location: { origin: 'https://ops.example', search },
    registration: {
      pushManager: {
        subscribe: vi.fn(() =>
          Promise.resolve({
            endpoint: 'https://push.example/new',
            toJSON: () => ({ endpoint: 'https://push.example/new' }),
          }),
        ),
      },
    },
  };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self,
    caches: {
      open: (name: string) => (opened.push(name), Promise.resolve(cache)),
      keys: () => Promise.resolve([]),
      match: (key: string) => (matched.push(key), Promise.resolve(new Response(`cached ${key}`))),
    },
    fetch: fetchMock,
    URL,
    URLSearchParams,
    Promise,
  });

  async function fire(type: string, extra: Record<string, unknown> = {}): Promise<void> {
    const pending: Promise<unknown>[] = [];
    handlers.get(type)?.({ waitUntil: (promise) => pending.push(promise), ...extra });
    await Promise.all(pending);
  }

  return { fire, added, opened, fetchMock, posted, matched };
}

describe('service worker (P03 repros)', () => {
  // F03-035. The worker holds no access token by design, so it cannot tell the
  // server itself: it tells the open app, which re-registers with the API
  // (tests/screens/push-sync.test.ts covers that half, and the next load).
  it('tells the open app about a push subscription the browser replaced', async () => {
    const worker = loadWorker();

    await worker.fire('pushsubscriptionchange', {
      oldSubscription: { options: { userVisibleOnly: true } },
    });

    expect(worker.posted).toEqual([{ type: 'push-subscription-changed' }]);
    expect(worker.fetchMock).not.toHaveBeenCalled();
  });

  // F03-036
  it('precaches the capture screens so they open offline the first time', async () => {
    const worker = loadWorker('?v=build-42');

    await worker.fire('install');

    expect(worker.added).toEqual(
      expect.arrayContaining([
        '/e/_/capture/registration',
        '/e/_/capture/footfall',
        '/e/_/capture/stamp',
        '/e/_/capture/redeem',
        '/e/_/shift',
      ]),
    );
    // Their scripts and styles too, or the cached page would not run offline.
    expect(worker.added).toEqual(
      expect.arrayContaining([
        '/_next/static/chunks/app-1a2b.js',
        '/_next/static/css/ui-9f.css',
        '/_next/static/chunks/rsc-3c4d.js',
      ]),
    );
    // No URL picks up the escaping backslash (which a browser reads as "/").
    expect(worker.added.filter((url) => url.includes('\\'))).toEqual([]);
    // One cache per build, so activate can drop the last build's chunks.
    expect(worker.opened.every((name) => name.endsWith('build-42'))).toBe(true);
  });

  // P09.8: every event's pages are one exported placeholder (ADR-008 §2).
  it("answers any event's screen offline from the placeholder's cached copy", async () => {
    const worker = loadWorker('?v=build-42');
    worker.fetchMock.mockImplementation(() => Promise.reject(new TypeError('offline')));
    let answer: Promise<Response> | undefined;

    await worker.fire('fetch', {
      request: { method: 'GET', url: 'https://ops.example/e/spoh-2028/capture/footfall' },
      respondWith: (response: Promise<Response>) => (answer = response),
    });

    expect(await (await answer!).text()).toBe('cached /e/_/capture/footfall');
    expect(worker.matched).toEqual(['/e/_/capture/footfall']);
  });
});
