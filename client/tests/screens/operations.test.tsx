import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { RuntimeSettings } from '@spoh/shared';
import { api } from '@/shared/lib/api';
import ImportsPage from '@/app/e/[event]/chief/imports/page';
import ReportsPage from '@/app/e/[event]/reports/page';
import ChiefPage from '@/app/e/[event]/chief/page';
import IcPage from '@/app/e/[event]/ic/page';
import UsersPage from '@/app/e/[event]/admin/users/page';
import SettingsPage from '@/app/e/[event]/admin/settings/page';
import AttendancePage from '@/app/e/[event]/attendance/page';
import StampPage from '@/app/e/[event]/capture/stamp/page';
import RedeemPage from '@/app/e/[event]/capture/redeem/page';
import { TEST_EVENT } from '../helpers/event';

/** The test event's API paths and screen addresses (tests/setup.ts). */
const API = `/events/${TEST_EVENT.id}`;

const state = vi.hoisted(() => ({ capabilities: [] as string[] }));
vi.mock('@/shared/shell/AppShell', () => ({
  AppShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock('@/shared/shell/SyncIndicator', () => ({ SyncIndicator: () => null }));
vi.mock('@/features/session', async (original) => ({
  ...(await original<typeof import('@/features/session')>()),
  useRequireSession: () => ({ accessToken: 'test' }),
  useCurrentSession: () => ({ accessToken: 'test' }),
  useMe: () => ({
    data: {
      volunteer: { id: 'viewer', role: 'CHIEF_COORDINATOR' },
      capabilities: state.capabilities,
      currentAssignment: {
        station: { id: 'station-1', name: 'Room', issuesStamp: true, type: { issuesStamp: true } },
      },
    },
  }),
}));
vi.mock('@/shared/hooks/useWakeLock', () => ({ useWakeLock: vi.fn() }));
vi.mock('@/features/capture/useQrScanner', () => ({
  useQrScanner: () => ({ videoRef: { current: null }, state: 'denied' }),
}));
vi.mock('@/features/attendance/AttendanceScanner', () => ({
  AttendanceScanner: () => <p>Scanner fixture</p>,
}));
vi.mock('@/shared/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const clients: QueryClient[] = [];
function show(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
beforeEach(() => {
  state.capabilities = [];
  mockedApi.mockReset();
  mockedApi.mockResolvedValue({ data: [], meta: { count: 0, nextCursor: null } });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});

describe('operations screen safety net', () => {
  it('requires an import preview and invalidates it when CSV changes', async () => {
    mockedApi.mockImplementation(async (_path, options) =>
      options?.method
        ? { rowsRead: 2, recordsCreated: 17, recordsSkipped: 0, issues: [], rehearsal: false }
        : { data: [] },
    );
    show(<ImportsPage />);
    expect(screen.queryByRole('button', { name: /^Import \d/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Insert the template' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview — writes nothing' }));
    await screen.findByRole('button', { name: 'Import 17 records as fallback sheet' });
    expect(mockedApi).toHaveBeenCalledWith(
      `${API}/fallback/imports/registrations`,
      expect.objectContaining({
        body: expect.objectContaining({ commit: false, source: 'FALLBACK_SHEET' }),
      }),
    );
    fireEvent.change(screen.getByLabelText('Rows (CSV)'), { target: { value: 'changed' } });
    expect(screen.queryByRole('button', { name: /^Import \d/ })).toBeNull();
    expect(mockedApi.mock.calls.filter(([, options]) => options?.method)).toHaveLength(1);
  });

  it('reports a failed report query without offering a misleading export', async () => {
    mockedApi.mockRejectedValue(new Error('offline'));
    show(<ReportsPage />);
    await screen.findByText('The report could not be generated');
    expect(screen.queryByRole('button', { name: 'Download XLSX' })).toBeNull();
  });

  it('shows dashboard failure rather than zero-valued operational totals', async () => {
    mockedApi.mockRejectedValue(new Error('offline'));
    show(<ChiefPage />);
    await screen.findByText('The dashboard could not be loaded');
  });

  it('requests the IC dashboard for the assigned station', async () => {
    show(<IcPage />);
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(`${API}/dashboard/station/station-1`),
    );
  });

  it('filters the roster by the selected role', async () => {
    show(<UsersPage />);
    fireEvent.change(screen.getByLabelText('Filter by role'), { target: { value: 'VOLUNTEER' } });
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(expect.stringContaining('role=VOLUNTEER')),
    );
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });

  it('does not offer settings mutation to a reader', async () => {
    show(<SettingsPage />);
    const name = await screen.findByLabelText('Event name');
    expect(name.hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull();
  });

  it('rejects an empty event name with the server schema message before submitting', async () => {
    state.capabilities = ['config.manage'];
    // The product rules load beside the settings (P09.14).
    mockedApi.mockImplementation(async (path: string) => {
      if (path.endsWith('/admin/event-settings')) {
        return {
          settings: {
            'product.countsMode': { mode: 'separate' },
            'product.visitorDataMode': 'none',
          },
          versions: { 'product.countsMode': 0, 'product.visitorDataMode': 0 },
        };
      }
      if (path.endsWith('/admin/attendance-settings')) {
        return {
          rootMembershipId: null,
          rootIsStale: false,
          campusCidrs: [],
          versions: { rootMembershipId: 0, campusCidrs: 0 },
          eligibleRoots: [],
        };
      }
      return { data: [], meta: { count: 0, nextCursor: null } };
    });
    show(<SettingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save settings' }));
    const name = screen.getByLabelText('Event name');
    const expected = RuntimeSettings.shape.eventName.safeParse('').error?.issues[0]?.message;
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('event-name-error')?.textContent).toBe(expected);
    expect(screen.getByText(/Nothing was saved/)).toBeTruthy();
    expect(mockedApi.mock.calls.every(([, options]) => !options?.method)).toBe(true);
    fireEvent.change(name, { target: { value: 'Rehearsal' } });
    expect(name.getAttribute('aria-invalid')).toBeNull();
  });

  it('requires a full PIN and sends it as attendance proof', async () => {
    mockedApi.mockResolvedValue({
      configured: true,
      eventDay: { id: 'day', label: 'Test day' },
      attendance: null,
      isRoot: false,
      isExco: false,
      canIssue: false,
      networkConfigured: false,
    });
    show(<AttendancePage />);
    const pin = await screen.findByLabelText('Secondary verification PIN');
    expect(
      screen.getByRole('button', { name: 'Submit attendance with PIN' }).hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.change(pin, { target: { value: '1234567890' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit attendance with PIN' }));
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(`${API}/attendance/submit`, {
        method: 'POST',
        body: { method: 'PIN', pin: '1234567890' },
      }),
    );
  });

  it('keeps manual card entry usable when the camera is denied', async () => {
    mockedApi.mockRejectedValue(new Error('offline'));
    show(<StampPage />);
    fireEvent.change(screen.getByLabelText('Six-character card code'), {
      target: { value: 'ABC123' },
    });
    fireEvent.submit(screen.getByLabelText('Six-character card code').closest('form')!);
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        `${API}/cards/ABC123/stamps`,
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({ stationId: 'station-1' }),
        }),
      ),
    );
    await screen.findByText('Could not reach the server. Stamp the card and carry on.');
  });

  it('cannot select an out-of-stock gift', async () => {
    mockedApi.mockResolvedValue({
      data: [{ id: 'gift', name: 'Badge', remaining: 0, lowStockThreshold: 2, outOfStock: true }],
    });
    show(<RedeemPage />);
    const gift = await screen.findByRole('button', { name: /Badge/ });
    expect(gift.hasAttribute('disabled')).toBe(true);
    fireEvent.click(gift);
    expect(screen.queryByRole('button', { name: 'Redeem without a card code' })).toBeNull();
  });
});
