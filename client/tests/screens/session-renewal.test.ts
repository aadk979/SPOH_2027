import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const recovery = vi.hoisted(() => ({
  required: true,
  handoff: vi.fn(async () => 'redirecting' as const),
}));
vi.mock('@/shared/lib/sessionHandoff', () => ({
  needsSessionHandoff: async () => recovery.required,
  recoverThroughHandoff: recovery.handoff,
}));
vi.mock('@/shared/lib/env', () => ({
  loadClientConfiguration: async () => ({ apiBaseUrl: 'https://api.example.test' }),
  ClientConfigurationError: class extends Error {},
}));
const fetchMock = vi.fn<typeof fetch>();
let session: typeof import('@/shared/lib/session');
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  recovery.required = true;
  recovery.handoff.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('navigator', { onLine: true });
  localStorage.clear();
  session = await import('@/shared/lib/session');
  session.setSession({
    accessToken: 'thin-proof',
    volunteerId: 'person_a',
    displayName: 'Sample',
    role: 'VOLUNTEER',
    expiresAt: Date.now() + 120_000,
    refreshAvailable: true,
  });
});
afterEach(() => {
  session.clearSession();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('session expiry during active work', () => {
  it('announces renewal without navigating away from unsaved work', async () => {
    await vi.advanceTimersByTimeAsync(60_000);
    expect(recovery.handoff).not.toHaveBeenCalled();
    expect(session.getSessionSnapshot()).toMatchObject({ renewalRequired: true });
    expect(session.getAccessToken()).toBe('thin-proof');
    await session.renewSession();
    expect(recovery.handoff).toHaveBeenCalledOnce();
  });
  it('retains identity for guides and unsent captures while withholding expired access', async () => {
    await vi.advanceTimersByTimeAsync(120_001);
    expect(session.getSession()).toBeNull();
    expect(session.getAccessToken()).toBeNull();
    expect(session.getSessionSnapshot().session?.volunteerId).toBe('person_a');
    expect(session.currentVolunteerId()).toBe('person_a');
    expect(session.getOfflineContentToken()).toBe('thin-proof');
    // The API can be unreachable even while the device still reports connected Wi-Fi.
    vi.stubGlobal('navigator', { onLine: true });
    expect(session.getOfflineContentToken()).toBe('thin-proof');
    expect(await session.refreshSession()).toBeNull();
    expect(recovery.handoff).not.toHaveBeenCalled();
  });
  it('admits an expired in-memory proof only to immutable offline guide and image requests', async () => {
    await vi.advanceTimersByTimeAsync(120_001);
    vi.stubGlobal('navigator', { onLine: false });
    fetchMock.mockImplementation(async () => new Response('{}'));
    const { api, apiBlob } = await import('@/shared/lib/api');
    await api('/events/event_a/content?v=version_a', { offlineContent: true });
    await apiBlob('/events/event_a/content/assets/version_a/map-0', { offlineContent: true });
    await api('/events/event_a/content/draft', { offlineContent: true });
    await api('/events/event_a/registrations', { method: 'POST', body: {} });
    expect(fetchMock.mock.calls.map(([, init]) => init?.headers)).toEqual([
      expect.objectContaining({ Authorization: 'Bearer thin-proof' }),
      expect.objectContaining({ Authorization: 'Bearer thin-proof' }),
      { Accept: 'application/json' },
      { Accept: 'application/json', 'Content-Type': 'application/json' },
    ]);
  });
  it('keeps unsaved work on an expired-access refusal and requires explicit renewal', async () => {
    await vi.advanceTimersByTimeAsync(120_001);
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    const { api } = await import('@/shared/lib/api');
    await expect(api('/events/event_a/content/draft')).rejects.toMatchObject({ status: 401 });
    expect(session.getSessionSnapshot().session?.volunteerId).toBe('person_a');
    expect(recovery.handoff).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('clears identity after a live credential is rejected', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 401 }));
    const { api } = await import('@/shared/lib/api');
    await expect(api('/events/event_a/content/draft')).rejects.toMatchObject({ status: 401 });
    expect(session.getSessionSnapshot().session).toBeNull();
    expect(session.getOfflineContentToken()).toBeNull();
  });
  it('uses the last signed proof to revoke an expired family on sign-out, then forgets it', async () => {
    await vi.advanceTimersByTimeAsync(120_001);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await session.signOut();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/auth/session',
      expect.objectContaining({
        method: 'DELETE',
        credentials: 'include',
        headers: expect.objectContaining({ Authorization: 'Bearer thin-proof' }),
      }),
    );
    expect(session.getSessionSnapshot().session).toBeNull();
    expect(session.currentVolunteerId()).toBeNull();
    expect(session.getOfflineContentToken()).toBeNull();
  });
  it('does not restore a cookie after offline sign-out and a fresh page load', async () => {
    fetchMock.mockRejectedValue(new TypeError('unreachable'));
    await session.signOut();
    expect(localStorage.getItem('@spoh/client/signed-out')).toBe('1');
    vi.resetModules();
    session = await import('@/shared/lib/session');
    fetchMock.mockClear();
    await session.bootstrapSession();
    expect(session.getSessionSnapshot()).toMatchObject({ status: 'ready', session: null });
    expect(recovery.handoff).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    const { allowSessionRecovery } = await import('@/shared/lib/sessionIntent');
    allowSessionRecovery();
    await session.bootstrapSession();
    expect(recovery.handoff).toHaveBeenCalledOnce();
  });
  it('discards a late refresh after sign-out without blocking a later explicit sign-in', async () => {
    recovery.required = false;
    let finish!: (response: Response) => void;
    const payload = {
      accessToken: 'late-proof',
      tokenType: 'Bearer',
      expiresIn: 900,
      volunteer: { id: 'person_a', displayName: 'Sample', role: 'VOLUNTEER' },
      refreshAvailable: true,
    };
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/refresh'))
        return new Promise((resolve) => {
          finish = resolve;
        });
      return init?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : Response.json(payload);
    });
    const refresh = session.refreshSession();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await session.signOut();
    finish(Response.json(payload));
    expect(await refresh).toBeNull();
    expect(session.getSessionSnapshot().session).toBeNull();
    expect(localStorage.getItem('@spoh/client/signed-out')).toBe('1');
    await session.openSession({ email: 'sample@example.test' });
    expect(session.getAccessToken()).toBe('late-proof');
    expect(localStorage.getItem('@spoh/client/signed-out')).toBeNull();
  });
});
