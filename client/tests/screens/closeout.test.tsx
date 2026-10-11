import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoLiveCheckCode, type LifecycleReadinessResponse } from '@spoh/shared';
import { api } from '@/shared/lib/api';
import { CloseoutTransition } from '@/features/closeout/components/CloseoutTransition';
import { CloseoutChecklist } from '@/features/closeout/components/CloseoutChecklist';
import { LostFoundCloseout } from '@/features/closeout/components/LostFoundCloseout';
import { OpenCloseoutCases } from '@/features/closeout/components/OpenCloseoutCases';
import CloseoutScreen from '@/features/closeout/screens/CloseoutScreen';
import { TEST_EVENT } from '../helpers/event';

const access = vi.hoisted(() => ({ allowed: true, session: true }));
vi.mock('@/features/session', async (original) => ({
  ...(await original<typeof import('@/features/session')>()),
  useAllows: () => () => access.allowed,
  useRequireSession: () => (access.session ? { volunteerId: 'organiser' } : null),
  useCurrentSession: () => (access.session ? { volunteerId: 'organiser' } : null),
  useEventTime: () => ({ dateTime: (iso: string) => iso }),
}));
vi.mock('@/shared/shell/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/features/reports', () => ({ ArchiveExportPanel: () => <p>Archive export panel</p> }));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockApi = vi.mocked(api);
const root = `/events/${TEST_EVENT.id}`;
const at = '2027-01-07T01:00:00.000Z';
function readiness(
  status: LifecycleReadinessResponse['lifecycle']['status'] = 'LIVE',
): LifecycleReadinessResponse {
  return {
    lifecycle: { eventId: TEST_EVENT.id, status, version: 7, hasBeenLive: true },
    evaluatedAt: at,
    reopenUntil: null,
    goLiveReadiness: GoLiveCheckCode.options.map((code) => ({
      code,
      state: 'passed' as const,
      passed: true,
      reasons: [],
    })),
    transitions: [
      {
        to: status === 'LIVE' ? 'CLOSED' : 'ARCHIVED',
        allowed: true,
        requiresReason: false,
        blockers: [],
      },
    ],
  };
}
function show(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
function emptyCases(path: string) {
  if (path.includes('/incidents')) return { data: [], meta: { count: 0, nextCursor: null } };
  if (path.includes('/lost-person/active')) return { alerts: [] };
  if (path.includes('/fallback/windows')) return { data: [] };
  if (path.includes('/lost-found?')) return { data: [] };
  return undefined;
}
beforeEach(() => {
  mockApi.mockReset();
  access.allowed = true;
  access.session = true;
});
afterEach(cleanup);

describe('guided close-out transitions', () => {
  it('requires reviewed confirmation and submits the exact lifecycle version', async () => {
    mockApi.mockResolvedValue({
      lifecycle: { ...readiness().lifecycle, status: 'CLOSED', version: 8 },
    });
    show(<CloseoutTransition readiness={readiness()} to="CLOSED" />);
    const button = screen.getByRole('button', { name: 'Close event' });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByLabelText(/I reviewed the open cases/));
    fireEvent.click(button);
    await screen.findByText('Event moved to closed.');
    expect(mockApi).toHaveBeenCalledWith(`${root}/lifecycle`, {
      method: 'POST',
      body: expect.objectContaining({
        to: 'CLOSED',
        expectedVersion: 7,
        idempotencyKey: expect.any(String),
      }),
    });
    expect(button).toHaveProperty('disabled', true);
  });

  it('retries an interrupted archive request with the same receipt and reports the server refusal', async () => {
    mockApi.mockRejectedValue(new Error('Readiness changed'));
    show(<CloseoutTransition readiness={readiness('CLOSED')} to="ARCHIVED" />);
    fireEvent.click(screen.getByLabelText(/I saved the export pack/));
    fireEvent.click(screen.getByRole('button', { name: 'Archive event' }));
    await screen.findByText(/Readiness changed/);
    fireEvent.click(screen.getByRole('button', { name: 'Archive event' }));
    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(2));
    expect(mockApi.mock.calls[0]![1]?.body).toEqual(mockApi.mock.calls[1]![1]?.body);
  });

  it('shows archive blockers without offering a transition, and fails closed when no guard is available', () => {
    const blocked = readiness('CLOSED');
    blocked.transitions = [
      {
        to: 'ARCHIVED',
        allowed: false,
        requiresReason: false,
        blockers: ['capture-grace-period', 'final-report'],
      },
    ];
    const view = show(<CloseoutTransition readiness={blocked} to="ARCHIVED" />);
    expect(screen.getByText('The late-sync grace period must finish first.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Archive event' })).toBeNull();
    view.rerender(<CloseoutTransition readiness={{ ...blocked, transitions: [] }} to="ARCHIVED" />);
    expect(screen.getByText(/unavailable in the current event state/)).toBeTruthy();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('orders the closure tasks and links the clone wizard on the platform route', () => {
    mockApi.mockResolvedValue({});
    const view = show(<CloseoutChecklist readiness={readiness()} />);
    expect(screen.getByText('1. Close capture')).toBeTruthy();
    expect(screen.getByText('4. Review the frozen final report')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Start a new event from this one' }).getAttribute('href'),
    ).toBe(`/events?clone=${TEST_EVENT.id}`);
    expect(screen.queryByRole('button', { name: 'Archive event' })).toBeNull();
    view.unmount();
    show(<CloseoutChecklist readiness={readiness('CLOSED')} />);
    expect(screen.getByRole('button', { name: 'Archive event' })).toBeTruthy();
  });
});

describe('lost-and-found settlement', () => {
  it('requires custody review, clears confirmation and reports the affected count', async () => {
    mockApi.mockResolvedValue({ markedUnclaimed: 3 });
    show(<LostFoundCloseout />);
    expect(screen.getByRole('button', { name: 'Settle lost and found' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByLabelText('I reviewed held items and their custody'));
    fireEvent.click(screen.getByRole('button', { name: 'Settle lost and found' }));
    await screen.findByText('3 items marked unclaimed.');
    expect(mockApi).toHaveBeenCalledWith(`${root}/lost-found/close-out`, {
      method: 'POST',
      body: {},
    });
    expect(screen.getByRole('button', { name: 'Settle lost and found' })).toHaveProperty(
      'disabled',
      true,
    );
  });
  it('shows failure and gates unauthorised custody changes', async () => {
    mockApi.mockRejectedValue(new Error('Custody settlement unavailable'));
    const view = show(<LostFoundCloseout />);
    fireEvent.click(screen.getByLabelText('I reviewed held items and their custody'));
    fireEvent.click(screen.getByRole('button', { name: 'Settle lost and found' }));
    await screen.findByText('Custody settlement unavailable');
    view.unmount();
    access.allowed = false;
    show(<LostFoundCloseout />);
    expect(screen.getByText(/authorised leader can settle/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Settle lost and found' })).toBeNull();
  });
});

describe('close-out workspace', () => {
  it('loads readiness, reloads after review and keeps case failures visible', async () => {
    mockApi.mockImplementation(async (path) =>
      String(path).endsWith('/lifecycle/readiness') ? readiness() : emptyCases(String(path)),
    );
    show(<CloseoutScreen />);
    await screen.findByRole('button', { name: 'Close event' });
    expect(
      screen.getByRole('link', { name: /active lost-person alerts/ }).getAttribute('href'),
    ).toBe(`/e/${TEST_EVENT.slug}/home`);
    fireEvent.click(screen.getByRole('button', { name: 'Reload close-out readiness' }));
    await waitFor(() =>
      expect(
        mockApi.mock.calls.filter(([path]) => String(path).endsWith('/lifecycle/readiness')),
      ).toHaveLength(2),
    );
    cleanup();
    mockApi.mockRejectedValue(new Error('Case list unavailable'));
    show(<OpenCloseoutCases />);
    await screen.findByText(/Some case lists could not load/);
  });

  it('shows a failed readiness and gates forbidden and signed-out leaders', async () => {
    mockApi.mockImplementation(async (path) => {
      if (String(path).endsWith('/lifecycle/readiness')) throw new Error('Readiness unavailable');
      return emptyCases(String(path));
    });
    show(<CloseoutScreen />);
    await screen.findByText('Readiness unavailable');
    expect(screen.queryByRole('button', { name: 'Close event' })).toBeNull();
    cleanup();
    access.allowed = false;
    mockApi.mockClear();
    show(<CloseoutScreen />);
    expect(screen.getByText(/available to authorised event leaders/)).toBeTruthy();
    expect(mockApi).not.toHaveBeenCalled();
    cleanup();
    access.session = false;
    expect(show(<CloseoutScreen />).container.textContent).toBe('');
  });
});
