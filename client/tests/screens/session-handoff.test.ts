import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { needsSessionHandoff, recoverThroughHandoff } from '@/shared/lib/sessionHandoff';

const config = vi.hoisted(() => ({
  apiBaseUrl: 'https://api.example.test',
  envLabel: 'production',
}));
vi.mock('@/shared/lib/env', () => ({ loadClientConfiguration: async () => config }));
const PENDING = '@spoh/client/session-handoff';
const storage = new Map<string, string>();
let href: string;
const assign = vi.fn();
const replaceState = vi.fn();
const fetchMock = vi.fn();

beforeEach(() => {
  href = 'https://client.example.test/e/sample/home?tab=recent';
  storage.clear();
  assign.mockReset();
  replaceState.mockReset();
  fetchMock.mockReset();
  config.envLabel = 'production';
  config.apiBaseUrl = 'https://api.example.test';
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('window', {
    location: {
      get href() {
        return href;
      },
      get origin() {
        return new URL(href).origin;
      },
      get pathname() {
        return new URL(href).pathname;
      },
      assign,
    },
    history: { replaceState },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('first-party recovery for a cross-site client', () => {
  it('uses a handoff only for production cross-origin hosting', async () => {
    expect(await needsSessionHandoff()).toBe(true);
    config.envLabel = 'development';
    expect(await needsSessionHandoff()).toBe(false);
    config.envLabel = 'production';
    config.apiBaseUrl = 'https://client.example.test';
    expect(await needsSessionHandoff()).toBe(false);
  });
  it('redirects without exposing the refresh credential and binds the code to a tab verifier', async () => {
    expect(await recoverThroughHandoff()).toBe('redirecting');
    const pending = JSON.parse(storage.get(PENDING)!);
    const recovery = new URL(assign.mock.calls[0]![0]);
    expect(recovery.pathname).toBe('/api/v1/auth/recover');
    expect(recovery.searchParams.get('returnTo')).toBe(href);
    expect(recovery.searchParams.get('state')).toBe(pending.state);
    expect(recovery.searchParams.get('challenge')).not.toBe(pending.verifier);
    expect(pending.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(storage.size).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('strips the code before redeeming, omits cookies, and clears the one-use verifier', async () => {
    storage.set(
      PENDING,
      JSON.stringify({ state: 'expected', verifier: 'tab-proof', startedAt: Date.now() }),
    );
    href += '&auth_code=one-use&auth_state=expected';
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'thin' }), { status: 200 }),
    );
    expect(await recoverThroughHandoff()).toEqual({ accessToken: 'thin' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/e/sample/home?tab=recent');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/auth/handoff',
      expect.objectContaining({
        credentials: 'omit',
        body: JSON.stringify({ code: 'one-use', verifier: 'tab-proof' }),
      }),
    );
    expect(storage.size).toBe(0);
    expect(assign).not.toHaveBeenCalled();
  });
  it.each(['wrong-state', 'expired', 'corrupt', 'missing', 'failed-redeem', 'signed-out'])(
    'fails closed for %s without a redirect loop',
    async (condition) => {
      if (condition !== 'missing')
        storage.set(
          PENDING,
          condition === 'corrupt'
            ? '{bad'
            : JSON.stringify({
                state: 'expected',
                verifier: 'proof',
                startedAt: Date.now() - (condition === 'expired' ? 180_000 : 0),
              }),
        );
      href += `&auth_state=${condition === 'wrong-state' ? 'wrong' : 'expected'}&${condition === 'signed-out' ? 'auth_status=signed-out' : 'auth_code=one-use'}`;
      fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
      expect(await recoverThroughHandoff()).toBeNull();
      expect(storage.size).toBe(0);
      expect(assign).not.toHaveBeenCalled();
      if (condition !== 'failed-redeem') expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('keeps the signed-out page usable', async () => {
    href = 'https://client.example.test/sign-in';
    expect(await recoverThroughHandoff()).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });
});
