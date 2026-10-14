import type { SessionResponse } from '@spoh/shared';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import StartScreen from '@/features/events/screens/StartScreen';
import EventsScreen from '@/features/events/screens/EventsScreen';
import MfaScreen from '@/features/session/screens/MfaScreen';
import { useCurrentSession, useSessionState } from '@/features/session';
import {
  clearSession,
  getAccessToken,
  getSessionSnapshot,
  sessionFromResponse,
  setSession,
} from '@/shared/lib/session';
import { LOCAL_CONFIGURATION } from '../helpers/clientConfiguration';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/shared/lib/env', () => ({
  loadClientConfiguration: async () => LOCAL_CONFIGURATION,
  getClientEnv: () => LOCAL_CONFIGURATION,
  ClientConfigurationError: class extends Error {},
}));
vi.mock('@/shared/lib/sessionHandoff', () => ({
  needsSessionHandoff: async () => false,
  recoverThroughHandoff: vi.fn(),
}));
const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];
const restricted: SessionResponse = {
  accessToken: 'synthetic-restricted-proof',
  tokenType: 'Bearer',
  expiresIn: 900,
  refreshAvailable: false,
  mfaRequired: true,
  volunteer: { id: 'initial-admin', displayName: 'Initial administrator', role: 'ADMIN' },
};
function show(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}
beforeEach(() => {
  localStorage.clear();
  navigation.replace.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () =>
    Response.json(
      {
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Complete MFA first',
          requestId: 'restricted-startup',
        },
      },
      { status: 401 },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  setSession(sessionFromResponse(restricted));
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  clearSession();
  vi.unstubAllGlobals();
});

it('routes the real root component to MFA before event reads can discard its restricted session', async () => {
  show(<StartScreen />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/mfa'));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(navigation.replace).not.toHaveBeenCalledWith('/sign-in');
  expect(getSessionSnapshot().session?.mfaRequired).toBe(true);
  expect(getAccessToken()).toBe(restricted.accessToken);
});

it('withholds restricted credentials from business hooks while retaining them for the MFA screen', () => {
  const current = renderHook(() => ({ current: useCurrentSession(), raw: useSessionState() }));
  expect(current.result.current.current).toBeNull();
  expect(current.result.current.raw.session?.mfaRequired).toBe(true);
  expect(getAccessToken()).toBe(restricted.accessToken);
});

it('holds event-picker and management reads while its session guard redirects to MFA', async () => {
  show(<EventsScreen />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/mfa'));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(getSessionSnapshot().session?.mfaRequired).toBe(true);
});

it('keeps authenticated setup and verification usable, then admits the completed full session', async () => {
  const completed: SessionResponse = {
    ...restricted,
    accessToken: 'synthetic-full-proof',
    mfaRequired: false,
  };
  fetchMock.mockImplementation(async (input, init) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer ' + restricted.accessToken,
    );
    if (String(input).endsWith('/auth/mfa/setup'))
      return Response.json({ secretCode: 'SYNTHETICSETUPKEY' });
    expect(String(input)).toMatch(/\/auth\/mfa\/verify$/);
    expect(JSON.parse(init?.body as string)).toEqual({ code: '123456' });
    return Response.json(completed);
  });
  show(<MfaScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Get setup key' }));
  await screen.findByLabelText('Authenticator setup key');
  fireEvent.change(screen.getByLabelText('Six-digit code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify authenticator' }));
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/events'));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(getSessionSnapshot().session?.mfaRequired).toBe(false);
  expect(getAccessToken()).toBe(completed.accessToken);
});
