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

function loadWorker() {
  const handlers = new Map<string, Handler>();
  const added: string[] = [];
  const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
  const cache = { add: vi.fn((url: string) => (added.push(url), Promise.resolve())), put: vi.fn() };
  const self = {
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: () => Promise.resolve(),
    location: { origin: 'https://ops.example' },
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
    caches: { open: () => Promise.resolve(cache), keys: () => Promise.resolve([]) },
    fetch: fetchMock,
    URL,
    Promise,
  });

  async function fire(type: string, extra: Record<string, unknown> = {}): Promise<void> {
    const pending: Promise<unknown>[] = [];
    handlers.get(type)?.({ waitUntil: (promise) => pending.push(promise), ...extra });
    await Promise.all(pending);
  }

  return { fire, added, fetchMock };
}

describe('service worker (P03 repros)', () => {
  // F03-035
  it.skip('tells the server about a push subscription the browser replaced', async () => {
    const worker = loadWorker();

    await worker.fire('pushsubscriptionchange', {
      oldSubscription: { options: { userVisibleOnly: true } },
    });

    const calls = worker.fetchMock.mock.calls as unknown as Array<[string]>;
    expect(calls.some(([url]) => String(url).includes('/notifications/subscriptions'))).toBe(true);
  });

  // F03-036
  it.skip('precaches the capture screens so they open offline the first time', async () => {
    const worker = loadWorker();

    await worker.fire('install');

    expect(worker.added).toEqual(
      expect.arrayContaining([
        '/capture/registration',
        '/capture/footfall',
        '/capture/stamp',
        '/capture/redeem',
        '/shift',
      ]),
    );
  });
});
