import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import RegistrationCaptureScreen from '@/features/registration/screens/RegistrationCaptureScreen';
import IcConsoleScreen from '@/features/dashboard/screens/IcConsoleScreen';
import { api } from '@/shared/lib/api';

const state = vi.hoisted(() => ({ capabilities: [] as string[] }));
vi.mock('@/shared/shell/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/shared/shell/SyncIndicator', () => ({ SyncIndicator: () => null }));
vi.mock('@/shared/hooks/useWakeLock', () => ({ useWakeLock: vi.fn() }));
vi.mock('@/features/capture', () => ({
  useCapture: () => ({
    sessionCount: 0,
    undoable: null,
    error: null,
    capture: vi.fn(),
    undo: vi.fn(),
  }),
}));
vi.mock('@/features/session', () => ({
  useRequireSession: () => ({ accessToken: 'fixture' }),
  useCurrentSession: () => ({ accessToken: 'fixture' }),
  useMe: () => ({
    data: {
      capabilities: state.capabilities,
      currentAssignment: { station: { id: 'booth', name: 'Booth', kind: 'SIGNUP_BOOTH' } },
      upcomingAssignments: [],
    },
  }),
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const clients: QueryClient[] = [];

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
const requested = (fragment: string) =>
  mockedApi.mock.calls.some(([path]) => String(path).includes(fragment));

beforeEach(() => {
  mockedApi.mockReset();
  mockedApi.mockResolvedValue({ data: [], meta: { count: 0, nextCursor: null } });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe('screens call only what the role may use (F02-020)', () => {
  it('does not ask for the booth total without station dashboard access', async () => {
    state.capabilities = ['registration.create'];
    show(<RegistrationCaptureScreen />);
    await screen.findByRole('main');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requested('/registrations/summary')).toBe(false);
  });

  it('asks for the booth total when the role may read it', async () => {
    state.capabilities = ['registration.create', 'dashboard.station.read'];
    show(<RegistrationCaptureScreen />);
    await waitFor(() => expect(requested('/registrations/summary')).toBe(true));
  });

  it('shows the swap queue only to a role that decides swaps', async () => {
    state.capabilities = ['dashboard.station.read'];
    show(<IcConsoleScreen />);
    await waitFor(() => expect(requested('/dashboard/station/booth')).toBe(true));
    expect(requested('/swaps/pending')).toBe(false);

    cleanup();
    mockedApi.mockClear();
    state.capabilities = ['dashboard.station.read', 'swap.approve'];
    show(<IcConsoleScreen />);
    await waitFor(() => expect(requested('/swaps/pending')).toBe(true));
  });
});
