import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOUD_CONFIGURATION, LOCAL_CONFIGURATION } from '../helpers/clientConfiguration';

vi.unmock('@/shared/lib/env');
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), { status });
beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('runtime configuration bootstrap', () => {
  it('shares one pending request, accepts immutable metadata and calculates hosted URLs only afterward', async () => {
    let finish: (value: Response) => void = () => undefined;
    const fetchMock = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const env = await import('@/shared/lib/env');
    const { getHostedSignInUrl } = await import('@/features/session/api');
    expect(() => env.getClientEnv()).toThrow(env.ClientConfigurationError);
    expect(() => env.isDevAuth()).toThrow(env.ClientConfigurationError);
    expect(() => getHostedSignInUrl()).toThrow(env.ClientConfigurationError);
    const first = env.loadClientConfiguration();
    expect(env.loadClientConfiguration()).toBe(first);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]).toMatchObject([
      '/api/v1/client-config',
      { credentials: 'omit', cache: 'no-store', redirect: 'error' },
    ]);
    finish(response(CLOUD_CONFIGURATION));
    expect(await first).toEqual(CLOUD_CONFIGURATION);
    expect(env.isDevAuth()).toBe(false);
    expect(getHostedSignInUrl()).toBe('https://api.example.test/api/v1/auth/login');
    expect(Object.isFrozen(env.getClientEnv().cognito)).toBe(true);
    expect(await env.loadClientConfiguration()).toBe(env.getClientEnv());
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not send authentication or API requests, declare a ready session or classify failed configuration as offline', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(null, 503));
    vi.stubGlobal('fetch', fetchMock);
    const env = await import('@/shared/lib/env');
    const session = await import('@/shared/lib/session');
    const { api, NetworkError } = await import('@/shared/lib/api');
    const results = await Promise.allSettled([session.bootstrapSession(), api('/fixture')]);
    for (const result of results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(env.ClientConfigurationError);
        expect(result.reason).not.toBeInstanceOf(NetworkError);
      }
    }
    expect(session.getSessionSnapshot().status).toBe('unknown');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/client-config');
  });

  it('retries a failed bootstrap and then sends the API request to the accepted runtime origin', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(null, 500));
    vi.stubGlobal('fetch', fetchMock);
    const env = await import('@/shared/lib/env');
    await expect(env.loadClientConfiguration()).rejects.toBeInstanceOf(
      env.ClientConfigurationError,
    );
    fetchMock.mockResolvedValueOnce(response(CLOUD_CONFIGURATION));
    fetchMock.mockResolvedValueOnce(response('accepted'));
    const { api } = await import('@/shared/lib/api');
    expect(await api('/fixture')).toEqual({ data: 'accepted' });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/v1/client-config',
      '/api/v1/client-config',
      'https://api.example.test/api/v1/fixture',
    ]);
    expect(env.isDevAuth()).toBe(false);
  });

  it.each([
    {},
    { ...LOCAL_CONFIGURATION, authProvider: undefined },
    { ...CLOUD_CONFIGURATION, cognito: null },
    { ...CLOUD_CONFIGURATION, apiBaseUrl: 'https://api.example.test/unsafe' },
  ])(
    'refuses malformed configuration instead of exposing development authentication',
    async (value) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response(value)),
      );
      const env = await import('@/shared/lib/env');
      await expect(env.loadClientConfiguration()).rejects.toBeInstanceOf(
        env.ClientConfigurationError,
      );
      expect(() => env.isDevAuth()).toThrow(env.ClientConfigurationError);
    },
  );

  it('bounds a stalled bootstrap so the startup screen can offer a retry', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), {
              once: true,
            });
          }),
      ),
    );
    const env = await import('@/shared/lib/env');
    const rejected = env.loadClientConfiguration().catch((cause: unknown) => cause);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await rejected).toBeInstanceOf(env.ClientConfigurationError);
    expect(() => env.getClientEnv()).toThrow(env.ClientConfigurationError);
  });
});
