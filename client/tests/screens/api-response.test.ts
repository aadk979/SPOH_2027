import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, NetworkError } from '@/shared/lib/api';
import { clearSession, refreshSession } from '@/shared/lib/session';
vi.mock('@/shared/lib/env', () => ({ clientEnv: { apiBaseUrl: 'http://fixture' } }));
vi.mock('@/shared/lib/session', () => ({
  getAccessToken: () => 'old-token',
  refreshSession: vi.fn(),
  clearSession: vi.fn(),
}));
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.mocked(refreshSession).mockReset();
  vi.mocked(clearSession).mockReset();
});
afterEach(() => vi.unstubAllGlobals());
describe('API response and refresh contract', () => {
  it('returns no payload for 204 even if it has no JSON body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await api('/fixture')).toBeUndefined();
  });
  it('refreshes once then clears the session when the retry is unauthorized', async () => {
    vi.mocked(refreshSession).mockResolvedValue({
      accessToken: 'new-token',
      expiresAt: Date.now() + 60000,
    } as Awaited<ReturnType<typeof refreshSession>>);
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Expired', requestId: 'r' } }),
          { status: 401 },
        ),
    );
    await expect(api('/fixture')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(clearSession).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[1]![1]?.headers).toMatchObject({
      Authorization: 'Bearer new-token',
    });
  });
  it('never refreshes an authentication route and supplies fallback error metadata', async () => {
    fetchMock.mockResolvedValue(
      new Response('not JSON', { status: 401, headers: { 'x-request-id': 'request-1' } }),
    );
    await expect(api('/auth/refresh')).rejects.toMatchObject({
      status: 401,
      message: 'Something went wrong',
    });
    expect(refreshSession).not.toHaveBeenCalled();
    expect(clearSession).toHaveBeenCalledOnce();
  });
  it('wraps transport failure without pretending the session expired', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(api('/fixture')).rejects.toBeInstanceOf(NetworkError);
    expect(clearSession).not.toHaveBeenCalled();
  });
});
