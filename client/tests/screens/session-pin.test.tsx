import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SessionResponse } from '@spoh/shared';
import SignInScreen from '@/features/session/screens/SignInScreen';

vi.mock('@/shared/lib/env', () => ({
  loadClientConfiguration: async () => ({ apiBaseUrl: 'https://api.example.test' }),
  ClientConfigurationError: class extends Error {},
  isDevAuth: () => false,
}));
vi.mock('@/shared/lib/sessionHandoff', () => ({
  needsSessionHandoff: async () => false,
  recoverThroughHandoff: vi.fn(),
}));
vi.mock('@/features/session', () => ({ getHostedSignInUrl: () => '#hosted-sign-in' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const PIN = '@spoh/client/expected-person';
const SIGNED_OUT = '@spoh/client/signed-out';
const fetchMock = vi.fn<typeof fetch>();
let session: typeof import('@/shared/lib/session');
function response(person: string, token: string): SessionResponse {
  return {
    accessToken: token, tokenType: 'Bearer', expiresIn: 900, refreshAvailable: true,
    volunteer: { id: person, displayName: person, role: 'VOLUNTEER' },
  };
}
async function reloadPage(): Promise<void> {
  vi.clearAllTimers();
  vi.resetModules();
  session = await import('@/shared/lib/session');
}
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  session = await import('@/shared/lib/session');
  session.setSession(session.sessionFromResponse(response('person_b', 'proof_b')));
});
afterEach(() => {
  cleanup();
  session.clearSession();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('refuses A’s late cookie after a page reload preserves B’s credential-free pin', async () => {
  expect(localStorage.getItem(PIN)).toBe('person_b');
  expect(localStorage.getItem(SIGNED_OUT)).toBeNull();
  await reloadPage();
  fetchMock.mockResolvedValue(Response.json(response('person_a', 'late_cookie_a')));
  await session.bootstrapSession();
  expect(session.getSessionSnapshot()).toMatchObject({
    status: 'ready', session: null, renewalRequired: true,
  });
  expect(session.currentVolunteerId()).toBeNull();
  expect(session.getAccessToken()).toBeNull();
  expect(localStorage.getItem(PIN)).toBe('person_b');
  expect(localStorage.length).toBe(1);
  expect(localStorage.key(0)).toBe(PIN);
});

it('recovers matching B on reload and keeps same-person renewal within its intent', async () => {
  await reloadPage();
  fetchMock.mockImplementation(async () => Response.json(response('person_b', 'renewed_b')));
  await session.bootstrapSession();
  expect(session.getSessionSnapshot()).toMatchObject({ status: 'ready', renewalRequired: false });
  expect(session.getAccessToken()).toBe('renewed_b');
  const generation = session.getSessionGeneration();
  await session.refreshSession();
  expect(session.getSessionGeneration()).toBe(generation);
  expect(localStorage.getItem(PIN)).toBe('person_b');
});

it('keeps the expected account after failed automatic recovery', async () => {
  await reloadPage();
  fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
  await session.bootstrapSession();
  expect(session.getSessionSnapshot()).toMatchObject({ status: 'ready', session: null });
  expect(localStorage.getItem(PIN)).toBe('person_b');
});

it('replaces the pin only after an explicit sign-in succeeds', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ error: { message: 'No account' } }, { status: 403 }));
  await expect(session.openSession({ email: 'person-a@example.test' })).rejects.toThrow('No account');
  expect(localStorage.getItem(PIN)).toBe('person_b');
  expect(session.getAccessToken()).toBe('proof_b');
  fetchMock.mockResolvedValueOnce(Response.json(response('person_a', 'explicit_a')));
  await session.openSession({ email: 'person-a@example.test' });
  expect(localStorage.getItem(PIN)).toBe('person_a');
  expect(session.getAccessToken()).toBe('explicit_a');
});

it('deliberate account change clears the pin and sign-out marker before hosted recovery', async () => {
  const intent = await import('@/shared/lib/sessionIntent');
  intent.rememberSignOut();
  await reloadPage();
  (await import('@/shared/lib/sessionIntent')).beginAccountChange();
  expect(localStorage.getItem(PIN)).toBeNull();
  expect(localStorage.getItem(SIGNED_OUT)).toBeNull();
  fetchMock.mockResolvedValue(Response.json(response('person_a', 'chosen_a')));
  await session.bootstrapSession();
  expect(session.getAccessToken()).toBe('chosen_a');
  expect(localStorage.getItem(PIN)).toBe('person_a');
});

it('wires the hosted Continue button to deliberate account change', async () => {
  (await import('@/shared/lib/sessionIntent')).rememberSignOut();
  render(<SignInScreen />);
  const link = screen.getByRole('link', { name: 'Continue to sign in' });
  link.addEventListener('click', (event) => event.preventDefault());
  fireEvent.click(link);
  expect(localStorage.getItem(PIN)).toBeNull();
  expect(localStorage.getItem(SIGNED_OUT)).toBeNull();
});
