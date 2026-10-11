import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/lib/api';
import { ApiError } from '@/shared/lib/apiErrors';
import CountsScreen from '@/features/counts/screens/CountsScreen';
import { STAFFING_SHIFT } from '../helpers/staffing';

const state = vi.hoisted(() => ({
  actions: [] as string[],
  personId: 'reader-a',
  eventId: 'event-a',
  signedIn: true,
}));
vi.mock('@/features/session', () => ({
  useRequireSession: () => (state.signedIn ? { volunteerId: state.personId } : null),
  useCurrentSession: () => (state.signedIn ? { volunteerId: state.personId } : null),
  useAllows: () => (action: string) => state.actions.includes(action),
}));
vi.mock('@/shared/lib/eventContext', () => ({
  useEventId: () => state.eventId,
  useOptionalEvent: () => null,
}));
vi.mock('@/shared/shell/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const AS_OF = '2027-01-08T02:00:00.000Z';
const responses = () => ({
  '/footfall/summary': {
    unit: 'roomEntries',
    bucket: '30m',
    total: 12,
    stations: [],
    containsFallbackData: false,
  },
  '/footfall/live': {
    unit: 'roomEntries',
    asOf: AS_OF,
    stations: [
      {
        stationId: 'room-a',
        stationName: 'Atrium',
        todayTotal: 12,
        lastActivityAt: AS_OF,
        minutesSinceLastActivity: 0,
        activeCounterCount: 2,
        silent: false,
      },
      {
        stationId: 'room-b',
        stationName: 'Gallery',
        todayTotal: 0,
        lastActivityAt: null,
        minutesSinceLastActivity: null,
        activeCounterCount: 0,
        silent: true,
      },
    ],
  },
  '/cards/funnel': {
    unit: 'cards',
    issued: 5,
    completed: 3,
    redeemed: 2,
    voided: 0,
    containsFallbackData: false,
    stages: [{ key: 'welcome', label: 'Welcome lounge', value: 4, rateOfIssued: 0.8 }],
  },
  '/gifts/summary': {
    unit: 'redemptions',
    total: 2,
    containsFallbackData: false,
    byGiftType: [{ giftTypeId: 'gift', giftTypeName: 'Badge', redeemed: 2, remaining: 8 }],
  },
  '/dashboard/data-health': {
    asOf: AS_OF,
    withinEventHours: true,
    fallbackWindowOpen: true,
    flaggedRedemptions: [],
    silentStations: [
      {
        stationId: 'room-b',
        stationName: 'Gallery',
        lastActivityAt: null,
        minutesSinceLastActivity: null,
      },
    ],
    staleDevices: [
      {
        volunteerId: 'person',
        volunteerName: 'Sam',
        stationName: 'Atrium',
        lastCaptureAt: null,
        minutesSinceLastCapture: null,
      },
    ],
  },
  '/roster/gaps': {
    asOf: AS_OF,
    activeShifts: [STAFFING_SHIFT],
    gaps: [
      {
        stationId: 'room-a',
        stationName: 'Atrium',
        shift: STAFFING_SHIFT,
        assigned: 3,
        checkedIn: 1,
        missing: 2,
        severity: 'PARTIAL',
      },
    ],
  },
});
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const node = (
    <QueryClientProvider client={client}>
      <CountsScreen />
    </QueryClientProvider>
  );
  return {
    ...render(node),
    refresh: () => (
      <QueryClientProvider client={client}>
        <CountsScreen />
      </QueryClientProvider>
    ),
  };
}
beforeEach(() => {
  state.actions = ['Dashboard.ReadStation', 'Dashboard.ReadEvent'];
  state.personId = 'reader-a';
  state.eventId = 'event-a';
  state.signedIn = true;
  mockedApi.mockReset();
  const data = responses();
  mockedApi.mockImplementation(async (path) => {
    const key = path.replace(/^\/events\/[^/]+/, '') as keyof typeof data;
    if (!(key in data)) throw new Error(`Unexpected test endpoint ${path}`);
    return data[key];
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe('counts and data health', () => {
  it('keeps visits, journeys and gifts distinct and reads every projection inside the selected event', async () => {
    mount();
    expect(await screen.findByText('12 room entries in the summary.')).toBeTruthy();
    expect(await screen.findByText('Welcome lounge: 4 journeys')).toBeTruthy();
    expect(await screen.findByText('2 gifts redeemed.')).toBeTruthy();
    expect(screen.getByText('Badge: 2 redeemed, 8 remaining')).toBeTruthy();
    expect(screen.getByText(/Atrium: 12 today · 2 active counters · Recording/)).toBeTruthy();
    expect(
      screen.getByText(/Gallery: 0 today · 0 active counters · Check this station/),
    ).toBeTruthy();
    expect(mockedApi.mock.calls.map(([path]) => path).sort()).toEqual(
      Object.keys(responses())
        .map((path) => `/events/event-a${path}`)
        .sort(),
    );
    expect(
      screen
        .getByRole('link', { name: 'Registration totals and historical reports' })
        .getAttribute('href'),
    ).toBe('/reports');
  });
  it('shows fallback, silent stations, stale devices and checked-in gaps as separate checks', async () => {
    mount();
    expect(await screen.findByText('Fallback is open; reconcile paper records.')).toBeTruthy();
    expect(screen.getByText('Gallery: no recent count. Check the assigned counter.')).toBeTruthy();
    expect(screen.getByText('Sam at Atrium: no recent capture.')).toBeTruthy();
    expect(
      screen.getByText('Atrium · Morning: 1 checked in of 3 assigned · 2 missing.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Check staffing' }).getAttribute('href')).toBe(
      '/admin/staffing',
    );
    expect(screen.getByRole('link', { name: 'Correct counts' }).getAttribute('href')).toBe(
      '/admin/corrections',
    );
  });
  it('does not request or display event-wide health without the event-wide grant', async () => {
    state.actions = ['Dashboard.ReadStation'];
    mount();
    await screen.findByText('12 room entries in the summary.');
    expect(mockedApi.mock.calls).toHaveLength(4);
    expect(
      mockedApi.mock.calls.some(
        ([path]) => path.includes('data-health') || path.includes('/roster/gaps'),
      ),
    ).toBe(false);
    expect(screen.queryByRole('heading', { name: 'Data health' })).toBeNull();
  });
  it('reads health independently when the reader has only event-wide permission', async () => {
    state.actions = ['Dashboard.ReadEvent'];
    mount();
    await screen.findByText('Fallback is open; reconcile paper records.');
    expect(mockedApi.mock.calls).toHaveLength(2);
    expect(screen.queryByRole('heading', { name: 'Room entries' })).toBeNull();
    expect(screen.getByText('Your event permission does not allow these counts.')).toBeTruthy();
  });
  it('makes no protected request when no grant is present or the session has ended', async () => {
    state.actions = [];
    const view = mount();
    expect(screen.getByText('Your event permission does not allow these counts.')).toBeTruthy();
    await waitFor(() => expect(mockedApi).not.toHaveBeenCalled());
    state.signedIn = false;
    view.rerender(view.refresh());
    expect(screen.queryByRole('main')).toBeNull();
    expect(mockedApi).not.toHaveBeenCalled();
  });
  it('keeps working health visible when count reads fail and retries the failed projections', async () => {
    mockedApi.mockImplementationOnce(async () => {
      throw new Error('Room totals could not be read');
    });
    mount();
    await screen.findByText('Room totals could not be read');
    expect(await screen.findByText('Fallback is open; reconcile paper records.')).toBeTruthy();
    expect(screen.queryByText('12 room entries in the summary.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry counts' }));
    expect(await screen.findByText('12 room entries in the summary.')).toBeTruthy();
    expect(
      mockedApi.mock.calls.filter(([path]) => path.endsWith('/footfall/summary')),
    ).toHaveLength(2);
    expect(
      mockedApi.mock.calls.filter(([path]) => path.endsWith('/dashboard/data-health')),
    ).toHaveLength(1);
  });
  it('retries health independently after a staffing read fails', async () => {
    const usual = mockedApi.getMockImplementation()!;
    let failed = false;
    mockedApi.mockImplementation(async (...args) => {
      if (args[0].endsWith('/roster/gaps') && !failed) {
        failed = true;
        throw new Error('Staffing unavailable');
      }
      return usual(...args);
    });
    mount();
    await screen.findByText('Staffing unavailable');
    expect(await screen.findByText('12 room entries in the summary.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry data health' }));
    expect(await screen.findByText('Fallback is open; reconcile paper records.')).toBeTruthy();
    expect(mockedApi.mock.calls.filter(([path]) => path.endsWith('/roster/gaps'))).toHaveLength(2);
    expect(mockedApi.mock.calls.filter(([path]) => path.endsWith('/cards/funnel'))).toHaveLength(1);
  });
  it('rejects a response that labels room entries as registrations rather than showing a false count', async () => {
    const usual = mockedApi.getMockImplementation()!;
    mockedApi.mockImplementation(async (...args) =>
      args[0].endsWith('/footfall/summary')
        ? { ...responses()['/footfall/summary'], unit: 'registrations' }
        : usual(...args),
    );
    mount();
    await screen.findByRole('button', { name: 'Retry counts' });
    expect(screen.queryByText('12 room entries in the summary.')).toBeNull();
    expect(await screen.findByText('Fallback is open; reconcile paper records.')).toBeTruthy();
  });
  it('hides already cached protected projections immediately when both grants are revoked', async () => {
    const view = mount();
    await screen.findByText('12 room entries in the summary.');
    await screen.findByText('Fallback is open; reconcile paper records.');
    const callsBefore = mockedApi.mock.calls.length;
    state.actions = [];
    view.rerender(view.refresh());
    expect(screen.queryByRole('heading', { name: 'Room entries' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Data health' })).toBeNull();
    expect(screen.queryByText('Sam at Atrium: no recent capture.')).toBeNull();
    expect(mockedApi.mock.calls).toHaveLength(callsBefore);
  });
  it('withholds the previous reader projections during a same-event person switch', async () => {
    const view = mount();
    await screen.findByText('12 room entries in the summary.');
    await screen.findByText('Fallback is open; reconcile paper records.');
    mockedApi.mockImplementation(() => new Promise(() => {}));
    state.personId = 'reader-b';
    view.rerender(view.refresh());
    expect(screen.queryByText('12 room entries in the summary.')).toBeNull();
    expect(screen.queryByText('Sam at Atrium: no recent capture.')).toBeNull();
    await waitFor(() => expect(mockedApi.mock.calls).toHaveLength(12));
  });
  it('discards retained staff identities when a same-person health refresh is refused', async () => {
    mount();
    await screen.findByText('Sam at Atrium: no recent capture.');
    const usual = mockedApi.getMockImplementation()!;
    mockedApi.mockImplementation(async (...args) => {
      if (args[0].endsWith('/dashboard/data-health'))
        throw new ApiError(403, {
          code: 'FORBIDDEN',
          message: 'Health access changed.',
          requestId: 'health-denied',
        });
      return usual(...args);
    });
    await act(() => clients[0]!.invalidateQueries({ queryKey: ['event-a', 'counts', 'health'] }));
    await screen.findByText('This read is no longer permitted. Reload your session.');
    expect(screen.queryByText('Sam at Atrium: no recent capture.')).toBeNull();
    await waitFor(() =>
      expect(
        clients[0]!.getQueryCache().findAll({
          queryKey: ['event-a', 'counts', 'health'],
        }),
      ).toHaveLength(0),
    );
    expect(screen.getByText('12 room entries in the summary.')).toBeTruthy();
  });
  it('does not invent silence or missing people for a quiet event with empty lists', async () => {
    const data = responses();
    data['/footfall/summary'].total = 0;
    data['/footfall/live'].stations = [];
    data['/cards/funnel'].stages = [];
    data['/gifts/summary'].total = 0;
    data['/gifts/summary'].byGiftType = [];
    data['/dashboard/data-health'].withinEventHours = false;
    data['/dashboard/data-health'].fallbackWindowOpen = false;
    data['/dashboard/data-health'].silentStations = [];
    data['/dashboard/data-health'].staleDevices = [];
    data['/roster/gaps'].gaps = [];
    mockedApi.mockImplementation(
      async (path) => data[path.replace(/^\/events\/[^/]+/, '') as keyof typeof data],
    );
    mount();
    expect(await screen.findByText('0 room entries in the summary.')).toBeTruthy();
    expect(await screen.findByText('Outside event hours; silence is expected.')).toBeTruthy();
    expect(screen.getByText('No open fallback window.')).toBeTruthy();
    expect(screen.queryByText(/no recent capture/)).toBeNull();
    expect(screen.queryByText(/assigned · .* missing/)).toBeNull();
  });
});
