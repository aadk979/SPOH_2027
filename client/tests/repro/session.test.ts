import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P03 bug reproductions: session bootstrap and runtime settings on the client
 * (F02-010 and F03-032). Skipped until fixed (P07); each asserts the correct
 * behaviour and fails today. The modules hold state, so each test loads fresh
 * copies, and `fetch` is stubbed to play the server.
 */

type Handler = (url: string, init?: RequestInit) => Promise<Response>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SESSION = {
  accessToken: 'token-1',
  tokenType: 'Bearer',
  expiresIn: 900,
  volunteer: { id: 'v1', displayName: 'Sam', role: 'IC' },
  capabilities: ['own.read'],
  refreshAvailable: true,
};

const UNAUTHENTICATED = {
  error: { code: 'UNAUTHENTICATED', message: 'Sign in', requestId: 'r' },
};

function stubServer(handler: Handler): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('client session and settings (P03 repros)', () => {
  // F02-010
  it.skip('makes a second bootstrap wait for the first refresh instead of returning at once', async () => {
    let finishRefresh: (response: Response) => void = () => undefined;
    stubServer((url) =>
      url.endsWith('/auth/refresh')
        ? new Promise<Response>((resolve) => {
            finishRefresh = resolve;
          })
        : Promise.resolve(json(404, {})),
    );
    const { bootstrapSession, getSessionSnapshot } = await import('@/lib/session');

    // React StrictMode runs the providers' effect twice in development.
    const first = bootstrapSession();
    const second = bootstrapSession();

    let secondSettled = false;
    void second.then(() => {
      secondSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The refresh has not answered, so no caller may treat the session as known.
    expect(secondSettled).toBe(false);
    expect(getSessionSnapshot().status).toBe('unknown');

    finishRefresh(json(200, SESSION));
    await first;
  });

  // F03-032
  it.skip('loads the runtime settings after an in-app sign-in', async () => {
    const fetchMock = stubServer((url) => {
      if (url.endsWith('/auth/refresh')) return Promise.resolve(json(401, UNAUTHENTICATED));
      if (url.endsWith('/auth/session')) return Promise.resolve(json(201, SESSION));
      if (url.endsWith('/admin/settings')) {
        const signedIn = fetchMock.mock.calls.some(([input]) =>
          String(input).endsWith('/auth/session'),
        );
        return Promise.resolve(
          signedIn
            ? json(200, { settings: { eventName: 'Dry Run 1', captureUndoWindowSeconds: 20 } })
            : json(401, UNAUTHENTICATED),
        );
      }
      return Promise.resolve(json(404, {}));
    });
    const { bootstrapSession, openSession } = await import('@/lib/session');
    const { getClientSettings, loadClientSettings } = await import('@/lib/runtimeSettings');

    // What the providers do on a signed-out page load (the sign-in screen).
    await bootstrapSession().then(() => loadClientSettings());

    // The volunteer signs in; the app navigates client-side, nothing reloads.
    await openSession({ email: 'sam@spoh.test' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getClientSettings().eventName).toBe('Dry Run 1');
  });
});
