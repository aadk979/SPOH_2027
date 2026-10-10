import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionResponse } from '@spoh/shared';

const configuration = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/shared/lib/env', () => ({
  loadClientConfiguration: configuration.load,
  ClientConfigurationError: class extends Error {},
}));
vi.mock('@/shared/lib/sessionHandoff', () => ({
  needsSessionHandoff: async () => false,
  recoverThroughHandoff: vi.fn(),
}));

const fetchMock = vi.fn<typeof fetch>();
let session: typeof import('@/shared/lib/session');
let requests: typeof import('@/shared/lib/api');
const JSON_PATH = '/events/event_a/registrations';
const IMAGE_PATH = '/events/event_a/content/assets/version_a/map-0';

function payload(person: string, token: string): SessionResponse {
  return {
    accessToken: token, tokenType: 'Bearer', expiresIn: 900, refreshAvailable: true,
    volunteer: { id: person, displayName: person, role: 'VOLUNTEER' },
  };
}
function denied(): Response {
  return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in', requestId: 'old-request' } }, { status: 401 });
}
function authResponse(init?: RequestInit): Response {
  return init?.method === 'DELETE'
    ? new Response(null, { status: 204 })
    : Response.json(payload('person_b', 'proof_b'), { status: 201 });
}
function invoke(kind: 'json' | 'blob') {
  return kind === 'json'
    ? requests.api(JSON_PATH, { method: 'POST', body: { categoryId: 'category_a', count: 1 } })
    : requests.apiBlob(IMAGE_PATH, { offlineContent: true });
}
function resourceCalls() {
  return fetchMock.mock.calls.filter(([url]) => !String(url).includes('/auth/'));
}
async function changePerson(): Promise<void> {
  await session.signOut();
  await session.openSession({ email: 'person-b@example.test' });
}

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  fetchMock.mockReset();
  configuration.load.mockReset().mockResolvedValue({ apiBaseUrl: 'https://api.example.test' });
  vi.stubGlobal('fetch', fetchMock);
  session = await import('@/shared/lib/session');
  requests = await import('@/shared/lib/api');
  session.setSession(session.sessionFromResponse(payload('person_a', 'proof_a')));
});
afterEach(() => {
  session.clearSession();
  vi.unstubAllGlobals();
});

it('keeps B’s refresh separate when A’s older refresh settles during B’s flight', async () => {
  const finishes: Array<(response: Response) => void> = [];
  fetchMock.mockImplementation(async (url, init) => {
    if (String(url).endsWith('/auth/session')) return authResponse(init);
    if (String(url).endsWith('/auth/refresh'))
      return new Promise((resolve) => { finishes.push(resolve); });
    return resourceCalls().length === 1 ? denied() : Response.json({ created: true });
  });
  const aFlight = session.refreshSession();
  expect(session.refreshSession()).toBe(aFlight);
  await vi.waitFor(() => expect(finishes).toHaveLength(1));
  await changePerson();
  const bRequest = invoke('json');
  await vi.waitFor(() => expect(finishes).toHaveLength(2));
  const bFlight = session.refreshSession();
  finishes[0]!(Response.json(payload('person_a', 'late_a')));
  expect(await aFlight).toBeNull();
  expect(session.refreshSession()).toBe(bFlight);
  expect(finishes).toHaveLength(2);
  finishes[1]!(Response.json(payload('person_b', 'renewed_b')));
  expect((await bFlight)?.volunteerId).toBe('person_b');
  expect(await bRequest).toEqual({ created: true });
  expect(resourceCalls().map(([, init]) => (init?.headers as Record<string, string>).Authorization))
    .toEqual(['Bearer proof_b', 'Bearer renewed_b']);
  expect(session.getAccessToken()).toBe('renewed_b');
});

it('retains B and requests explicit renewal when B’s cookie recovers person A', async () => {
  fetchMock.mockImplementation(async (url, init) => {
    if (String(url).endsWith('/auth/session')) return authResponse(init);
    if (String(url).endsWith('/auth/refresh')) return Response.json(payload('person_a', 'cookie_a'));
    return denied();
  });
  await changePerson();
  const personB = session.getSessionSnapshot().session;
  const generation = session.getSessionGeneration();
  await expect(invoke('json')).rejects.toMatchObject({ status: 401, code: 'SESSION_EXPIRED' });
  expect(session.getSessionSnapshot()).toMatchObject({ renewalRequired: true, session: personB });
  expect(session.getSessionSnapshot().session).toBe(personB);
  expect(session.currentVolunteerId()).toBe('person_b');
  expect(session.getAccessToken()).toBe('proof_b');
  expect(session.getSessionGeneration()).toBe(generation + 1);
  expect(resourceCalls()).toHaveLength(1);
  await session.openSession({ email: 'person-b@example.test' });
  expect(session.getSessionSnapshot().renewalRequired).toBe(false);
  expect(session.getAccessToken()).toBe('proof_b');
});

it('shares one same-person refresh across concurrent JSON and image refusals, then retries both', async () => {
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation(async (url, init) => {
    if (String(url).endsWith('/auth/refresh'))
      return new Promise((resolve) => { finish = resolve; });
    if ((init?.headers as Record<string, string>).Authorization === 'Bearer proof_a') return denied();
    return String(url).endsWith('/map-0')
      ? new Response('floor plan bytes')
      : Response.json({ created: true });
  });
  const generation = session.getSessionGeneration();
  const capture = invoke('json');
  const image = invoke('blob');
  await vi.waitFor(() => expect(resourceCalls()).toHaveLength(2));
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1);
  finish(Response.json(payload('person_a', 'renewed_a')));
  expect(await capture).toEqual({ created: true });
  expect(await (await image as Blob).text()).toBe('floor plan bytes');
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1);
  expect(resourceCalls().map(([, init]) => (init?.headers as Record<string, string>).Authorization))
    .toEqual(['Bearer proof_a', 'Bearer proof_a', 'Bearer renewed_a', 'Bearer renewed_a']);
  expect(session.getSessionGeneration()).toBe(generation);
});

describe.each(['json', 'blob'] as const)('%s requests across a change of person', (kind) => {
  it('does not renew or resend a delayed A refusal as B, and keeps B signed in', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/auth/session')) return authResponse(init);
      return new Promise((resolve) => { finish = resolve; });
    });
    const pending = invoke(kind);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await changePerson();
    finish(denied());
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(resourceCalls()).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/refresh'))).toBe(false);
    expect(session.getAccessToken()).toBe('proof_b');
  });

  it('does not borrow B from the catch path of A’s failed refresh', async () => {
    let fail!: (cause: Error) => void;
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/auth/session')) return authResponse(init);
      if (String(url).endsWith('/auth/refresh'))
        return new Promise((_resolve, reject) => { fail = reject; });
      return denied();
    });
    const pending = invoke(kind);
    await vi.waitFor(() => expect(fail).toBeTypeOf('function'));
    await changePerson();
    fail(new TypeError('Network unavailable'));
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(resourceCalls()).toHaveLength(1);
    expect(session.getAccessToken()).toBe('proof_b');
  });

  it('allows its own successful refresh to retry with the recovered A session', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith('/auth/refresh')) return Response.json(payload('person_a', 'renewed_a'));
      return resourceCalls().length === 1 ? denied() : Response.json({ created: true });
    });
    const originalGeneration = session.getSessionGeneration();
    await invoke(kind);
    expect(resourceCalls().map(([, init]) => (init?.headers as Record<string, string>).Authorization))
      .toEqual(['Bearer proof_a', 'Bearer renewed_a']);
    expect(session.getSessionGeneration()).toBe(originalGeneration);
    expect(session.getAccessToken()).toBe('renewed_a');
  });

  it('does not clear B when A’s legitimate refreshed retry answers late', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/auth/session')) return authResponse(init);
      if (String(url).endsWith('/auth/refresh')) return Response.json(payload('person_a', 'renewed_a'));
      return resourceCalls().length === 1
        ? denied()
        : new Promise((resolve) => { finish = resolve; });
    });
    const pending = invoke(kind);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await changePerson();
    finish(denied());
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(resourceCalls().map(([, init]) => (init?.headers as Record<string, string>).Authorization))
      .toEqual(['Bearer proof_a', 'Bearer renewed_a']);
    expect(session.getAccessToken()).toBe('proof_b');
  });

  it.each([200, 204])('rejects A’s delayed HTTP %i result after B signs in', async (status) => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/auth/session')) return authResponse(init);
      return new Promise((resolve) => { finish = resolve; });
    });
    const pending = invoke(kind);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await changePerson();
    finish(status === 204 ? new Response(null, { status }) : Response.json({ privatePerson: 'person_a' }));
    await expect(pending).rejects.toMatchObject({ status: 401, code: 'SESSION_EXPIRED' });
    expect(resourceCalls()).toHaveLength(1);
    expect(session.getAccessToken()).toBe('proof_b');
  });

  it('rejects A’s body that finishes decoding only after B signs in', async () => {
    let finish!: () => void;
    const response = Response.json({ privatePerson: 'person_a' });
    if (kind === 'json')
      vi.spyOn(response, 'json').mockImplementation(() => new Promise((resolve) => {
        finish = () => resolve({ privatePerson: 'person_a' });
      }));
    else
      vi.spyOn(response, 'blob').mockImplementation(() => new Promise((resolve) => {
        finish = () => resolve(new Blob(['private A bytes']));
      }));
    fetchMock.mockImplementation(async (url, init) =>
      String(url).endsWith('/auth/session') ? authResponse(init) : response,
    );
    const pending = invoke(kind);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await changePerson();
    finish();
    await expect(pending).rejects.toMatchObject({ status: 401, code: 'SESSION_EXPIRED' });
    expect(session.getAccessToken()).toBe('proof_b');
  });

  it('does not send A’s request if configuration finishes after B signs in', async () => {
    let finish!: (config: { apiBaseUrl: string }) => void;
    configuration.load.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    fetchMock.mockImplementation(async (_url, init) => authResponse(init));
    const pending = invoke(kind);
    await vi.waitFor(() => expect(configuration.load).toHaveBeenCalledOnce());
    await changePerson();
    finish({ apiBaseUrl: 'https://api.example.test' });
    await expect(pending).rejects.toMatchObject({ status: 401, code: 'SESSION_EXPIRED' });
    expect(resourceCalls()).toHaveLength(0);
    expect(session.getAccessToken()).toBe('proof_b');
  });

  it('rejects A’s delayed network failure without ending B’s session', async () => {
    let fail!: (cause: Error) => void;
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/auth/session')) return authResponse(init);
      return new Promise((_resolve, reject) => { fail = reject; });
    });
    const pending = invoke(kind);
    await vi.waitFor(() => expect(fail).toBeTypeOf('function'));
    await changePerson();
    fail(new TypeError('Network unavailable'));
    await expect(pending).rejects.toMatchObject({ status: 401, code: 'SESSION_EXPIRED' });
    expect(session.getAccessToken()).toBe('proof_b');
  });

  it.each([200, 204])('accepts an already sent HTTP %i result after same-person silent renewal', async (status) => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith('/auth/refresh')) return Response.json(payload('person_a', 'renewed_a'));
      return new Promise((resolve) => { finish = resolve; });
    });
    const generation = session.getSessionGeneration();
    const pending = invoke(kind);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await session.refreshSession();
    finish(status === 204 ? new Response(null, { status }) : Response.json({ created: true }));
    const result = await pending;
    if (kind === 'blob') expect(await (result as Blob).text()).toBe(status === 204 ? '' : '{"created":true}');
    else expect(result).toEqual(status === 204 ? undefined : { created: true });
    expect(resourceCalls()).toHaveLength(1);
    expect(session.getSessionGeneration()).toBe(generation);
    expect(session.getAccessToken()).toBe('renewed_a');
  });

  it('accepts a body that finishes decoding after same-person silent renewal', async () => {
    let finish!: () => void;
    const response = Response.json({ created: true });
    if (kind === 'json')
      vi.spyOn(response, 'json').mockImplementation(() => new Promise((resolve) => {
        finish = () => resolve({ created: true });
      }));
    else
      vi.spyOn(response, 'blob').mockImplementation(() => new Promise((resolve) => {
        finish = () => resolve(new Blob(['floor plan bytes']));
      }));
    fetchMock.mockImplementation(async (url) => String(url).endsWith('/auth/refresh')
      ? Response.json(payload('person_a', 'renewed_a')) : response);
    const generation = session.getSessionGeneration();
    const pending = invoke(kind);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await session.refreshSession();
    finish();
    const result = await pending;
    if (kind === 'blob') expect(await (result as Blob).text()).toBe('floor plan bytes');
    else expect(result).toEqual({ created: true });
    expect(session.getSessionGeneration()).toBe(generation);
    expect(session.getAccessToken()).toBe('renewed_a');
  });

  it('invalidates an old request after explicit logout and sign-in as the same person', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/auth/session')) return init?.method === 'DELETE'
        ? new Response(null, { status: 204 }) : Response.json(payload('person_a', 'new_sign_in_a'));
      return new Promise((resolve) => { finish = resolve; });
    });
    const pending = invoke(kind);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await session.signOut();
    await session.openSession({ email: 'person-a@example.test' });
    finish(Response.json({ created: true }));
    await expect(pending).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(session.getAccessToken()).toBe('new_sign_in_a');
    expect(resourceCalls()).toHaveLength(1);
  });
});
