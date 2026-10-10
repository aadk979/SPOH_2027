import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GENERATED_SETTING_DEFAULTS,
  GENERATED_SETTING_METADATA,
  scopedOperationalKeys,
  type ScopedOperationalSetting,
  type ScopedOperationalSettingKey,
  type ScopedSettingsReadResponse,
  type ScopedSettingsHistoryRecord,
  type ScopedSettingsTarget,
} from '@spoh/shared';
import { OperationalCataloguePanel } from '@/features/settings/components/OperationalCataloguePanel';
import { api } from '@/shared/lib/api';
import { ApiError, NetworkError } from '@/shared/lib/apiErrors';
import { scopedSettingsKeys } from '@/features/settings/queries';
import { catalogueValue } from '@/features/settings/model/operationalCatalogue';

const owner = vi.hoisted(() => ({ eventId: 'evt_test', personId: 'catalogue-manager' }));
const stationState = vi.hoisted(() => ({ unavailable: false }));
vi.mock('@/shared/lib/eventContext', async (original) => ({
  ...(await original<typeof import('@/shared/lib/eventContext')>()),
  useEventId: () => owner.eventId,
}));
vi.mock('@/features/session', async (original) => ({
  ...(await original<typeof import('@/features/session')>()),
  useCurrentSession: () => (owner.personId ? { volunteerId: owner.personId } : null),
  useEventTime: () => ({ dateTime: (value: string) => `event-clock:${value}` }),
}));
vi.mock('@/features/stations', () => ({
  useStations: () => ({
    data: stationState.unavailable ? undefined : [{ id: 'station', name: 'Entry station' }],
    isError: stationState.unavailable,
  }),
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const clients: QueryClient[] = [];
let overrides: Partial<ScopedOperationalSetting>;
let eventStatus: ScopedSettingsReadResponse['eventStatus'];
let readFailure: Error | null;
let historyFailure: Error | null;
let malformedRead: unknown;
let malformedHistory: unknown;
let rows: ScopedSettingsHistoryRecord[];
let pagination: boolean;
function catalogue(target: ScopedSettingsTarget): ScopedSettingsReadResponse {
  return {
    eventId: owner.eventId,
    target,
    eventStatus,
    evaluatedAt: '2027-01-01T03:00:00Z',
    data: scopedOperationalKeys(target.scope).map((key) => ({
      key,
      value: GENERATED_SETTING_DEFAULTS[key],
      source: { scope: 'default', version: 0 },
      storedVersion: 0,
      invalidScopes: [],
      ...(key === (overrides.key ?? 'silentStationMinutes') ? overrides : {}),
    })),
  };
}
function record(input: Partial<ScopedSettingsHistoryRecord> = {}): ScopedSettingsHistoryRecord {
  return {
    id: 'history-2',
    key: 'silentStationMinutes',
    version: 2,
    source: 'USER',
    createdAt: '2027-01-01T02:00:00Z',
    createdByYou: true,
    reason: 'Reviewed station alert threshold',
    values: { available: true, operation: 'set', before: 10, after: 20 },
    ...input,
  };
}
function denied(status = 403) {
  return new ApiError(status, {
    code: 'FORBIDDEN',
    message: 'Private server detail',
    requestId: 'test',
  });
}
function show(enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return {
    client,
    ...render(<OperationalCataloguePanel enabled={enabled} />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}
async function expand() {
  fireEvent.click(screen.getByRole('button', { name: 'Settings catalogue' }));
  await screen.findByRole('heading', { name: 'Silent station' });
}
async function history(label = 'Silent station') {
  fireEvent.click(screen.getByRole('button', { name: `View history: ${label}` }));
  await screen.findByRole('heading', { name: `History: ${label}` });
}
function rowFor(label: string) {
  return within(screen.getByRole('heading', { name: label }).closest('li')!);
}
beforeEach(() => {
  owner.eventId = 'evt_test';
  owner.personId = 'catalogue-manager';
  stationState.unavailable = false;
  overrides = {};
  eventStatus = 'LIVE';
  readFailure = null;
  historyFailure = null;
  malformedRead = undefined;
  malformedHistory = undefined;
  rows = [record()];
  pagination = false;
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (path, options) => {
    if (options?.method && options.method !== 'GET') throw new Error('Reader attempted a write');
    const params = new URL(path, 'https://fixture.invalid').searchParams;
    const target: ScopedSettingsTarget =
      params.get('scope') === 'station'
        ? { scope: 'station', stationId: params.get('stationId')! }
        : { scope: 'event' };
    if (!path.includes('/history?')) {
      if (readFailure) throw readFailure;
      return malformedRead ?? catalogue(target);
    }
    if (historyFailure) throw historyFailure;
    const key = params.get('key') as ScopedOperationalSettingKey;
    const selected = rows.filter((row) => row.key === key);
    const data = pagination
      ? selected.slice(params.has('cursor') ? 1 : 0, params.has('cursor') ? 2 : 1)
      : selected;
    return (
      malformedHistory ?? {
        ...catalogue(target),
        key,
        data,
        meta: {
          count: data.length,
          nextCursor: pagination && !params.has('cursor') ? data.at(-1)!.id : null,
        },
      }
    );
  });
});
afterEach(() => {
  expect(
    mockedApi.mock.calls.filter(([, options]) => options?.method && options.method !== 'GET'),
  ).toEqual([]);
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe('operational settings catalogue reader', () => {
  it('reads only after expansion and groups all permitted event keys from the registry', async () => {
    show();
    expect(mockedApi).not.toHaveBeenCalled();
    await expand();
    expect(mockedApi).toHaveBeenCalledWith(
      '/events/evt_test/admin/settings/catalogue?scope=event',
      { cache: 'no-store' },
    );
    expect(screen.getAllByRole('button', { name: /^View history:/ })).toHaveLength(14);
    for (const key of scopedOperationalKeys('event')) {
      const row = rowFor(GENERATED_SETTING_METADATA[key].label);
      expect(row.getByText(GENERATED_SETTING_METADATA[key].description)).toBeTruthy();
    }
    expect(screen.getByRole('heading', { name: 'Alerts' })).toBeTruthy();
    expect(rowFor('Silent station').getByText('Scoped value: 15 minutes')).toBeTruthy();
    expect(rowFor('Capture open').getByText('Scoped value: Open')).toBeTruthy();
    expect(
      rowFor('Incident push severities').getByText('Scoped value: HIGH, CRITICAL'),
    ).toBeTruthy();
    expect(rowFor('Card name').getByText('Scoped value: Mission Card')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Apply|Restore/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Schedules:/ })).toHaveLength(scopedOperationalKeys('event').filter((key) => GENERATED_SETTING_METADATA[key].schedulable).length);
    expect(
      screen.getByText('Checked event-clock:2027-01-01T03:00:00Z on the event clock.'),
    ).toBeTruthy();
  });

  it.each([false, true])(
    'keeps the catalogue private when enabled=%s without a session',
    (enabled) => {
      owner.personId = '';
      show(enabled);
      expect(screen.queryByRole('button', { name: 'Settings catalogue' })).toBeNull();
      expect(mockedApi).not.toHaveBeenCalled();
    },
  );
  it('omits the reader when capability is unavailable', () => {
    show(false);
    expect(screen.queryByRole('button', { name: 'Settings catalogue' })).toBeNull();
    expect(mockedApi).not.toHaveBeenCalled();
  });
  it('reads only station-capable keys and distinguishes inherited and selected versions', async () => {
    show();
    await expand();
    overrides = { value: 25, source: { scope: 'event', version: 7 } };
    fireEvent.change(screen.getByLabelText('Catalogue scope'), { target: { value: 'station' } });
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^View history:/ })).toHaveLength(3),
    );
    expect(rowFor('Silent station').getByText('Scoped value: 25 minutes')).toBeTruthy();
    expect(
      rowFor('Silent station').getByText(
        'Inherited from event settings · Selected scope version 0 · Source version 7',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Card name' })).toBeNull();
    expect(mockedApi).toHaveBeenCalledWith(
      '/events/evt_test/admin/settings/catalogue?scope=station&stationId=station',
      { cache: 'no-store' },
    );
  });
  it('explains selected overrides and invalid skipped layers without rendering malformed raw values', async () => {
    overrides = {
      source: { scope: 'platform', version: 3 },
      storedVersion: 4,
      invalidScopes: ['event'],
    };
    show();
    await expand();
    expect(
      rowFor('Silent station').getByText('An invalid stored value was skipped at event scope.'),
    ).toBeTruthy();
    expect(
      rowFor('Silent station').getByText(
        'Inherited from platform settings · Selected scope version 4 · Source version 3',
      ),
    ).toBeTruthy();
  });
  it('keeps archived catalogue values and history readable', async () => {
    eventStatus = 'ARCHIVED';
    overrides = { storedVersion: 2, source: { scope: 'event', version: 2 } };
    show();
    await expand();
    expect(screen.getByText('Archived event settings are read only.')).toBeTruthy();
    expect(
      rowFor('Silent station').getByText(
        'Override at this event · Selected scope version 2 · Source version 2',
      ),
    ).toBeTruthy();
    await history();
    expect(screen.getByText('After: 20 minutes')).toBeTruthy();
  });
  it('leaves event reads available when station loading fails', async () => {
    stationState.unavailable = true;
    show();
    await expand();
    expect(
      screen.getByText('Stations are unavailable. Event settings remain available.'),
    ).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });
  it('loads owned history privately, paginates older rows and renders attribution/reasons', async () => {
    rows.push(record({ id: 'history-1', version: 1, createdByYou: false, reason: null }));
    pagination = true;
    show();
    await expand();
    expect(mockedApi.mock.calls.some(([path]) => path.includes('/history?'))).toBe(false);
    await history();
    expect(mockedApi).toHaveBeenCalledWith(
      '/events/evt_test/admin/settings/catalogue/history?scope=event&key=silentStationMinutes&limit=20',
      { cache: 'no-store' },
    );
    expect(screen.getByText('Before: 10 minutes')).toBeTruthy();
    expect(screen.getByText('Reason: Reviewed station alert threshold')).toBeTruthy();
    expect(screen.getByText('event-clock:2027-01-01T02:00:00Z · Changed by you')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Load more catalogue history' }));
    await screen.findByRole('heading', { name: 'Version 1 · Changed by a person' });
    expect(
      within(screen.getByRole('list', { name: 'Catalogue history results' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(2);
    expect(mockedApi).toHaveBeenCalledWith(
      '/events/evt_test/admin/settings/catalogue/history?scope=event&key=silentStationMinutes&limit=20&cursor=history-2',
      { cache: 'no-store' },
    );
    expect(screen.queryByRole('button', { name: 'Load more catalogue history' })).toBeNull();
  });
  it('shows reset removal and unavailable history without inventing an inherited result', async () => {
    rows = [
      record({ source: 'RESET', values: { available: true, operation: 'reset', before: 20 } }),
      record({ id: 'invalid', version: 1, source: 'MIGRATION', values: { available: false } }),
    ];
    show();
    await expand();
    await history();
    expect(
      screen.getByText('Override removed. The inherited value at that time is not recorded.'),
    ).toBeTruthy();
    expect(screen.getByText('This historical value is unavailable.')).toBeTruthy();
    expect(screen.queryByText(/^After:/)).toBeNull();
  });
  it('reports empty owned history and resets the selected key when changing scope', async () => {
    rows = [];
    show();
    await expand();
    await history();
    expect(screen.getByText('No recorded changes for this setting at this scope.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Catalogue scope'), { target: { value: 'station' } });
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^View history:/ })).toHaveLength(3),
    );
    expect(screen.queryByRole('heading', { name: 'History: Silent station' })).toBeNull();
    await history();
    expect(mockedApi).toHaveBeenCalledWith(
      '/events/evt_test/admin/settings/catalogue/history?scope=station&key=silentStationMinutes&limit=20&stationId=station',
      { cache: 'no-store' },
    );
  });
  it('uses separate cache entries when changing the historical key', async () => {
    const view = show();
    await expand();
    await history();
    fireEvent.click(screen.getByRole('button', { name: 'Back to catalogue values' }));
    await history('Card name');
    expect(screen.queryByText('Reason: Reviewed station alert threshold')).toBeNull();
    expect(
      view.client.getQueryData(
        scopedSettingsKeys.history(owner.eventId, owner.personId, {
          target: { scope: 'event' },
          key: 'vocabulary.missionCard',
        }),
      ),
    ).toBeTruthy();
  });
  it.each([401, 403])(
    'clears all private scoped queries and stays denied after a %s history response',
    async (status) => {
      const view = show();
      await expand();
      historyFailure = denied(status);
      fireEvent.click(screen.getByRole('button', { name: 'View history: Silent station' }));
      await screen.findByText('Settings catalogue access is unavailable. Reload your session.');
      expect(screen.queryByRole('button', { name: /^View history:/ })).toBeNull();
      expect(screen.queryByText('Scoped value: 15 minutes')).toBeNull();
      expect(
        view.client
          .getQueriesData({
            queryKey: scopedSettingsKeys.owner(owner.eventId, owner.personId),
          })
          .every(([, data]) => data === undefined),
      ).toBe(true);
      expect(screen.queryByText('Private server detail')).toBeNull();
    },
  );
  it('clears prior private data when a catalogue read loses authority', async () => {
    const view = show();
    await expand();
    readFailure = denied();
    fireEvent.click(screen.getByRole('button', { name: 'Reload catalogue' }));
    await screen.findByText('Settings catalogue access is unavailable. Reload your session.');
    expect(
      view.client
        .getQueriesData({
          queryKey: scopedSettingsKeys.owner(owner.eventId, owner.personId),
        })
        .every(([, data]) => data === undefined),
    ).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Silent station' })).toBeNull();
  });
  it('hides stale current values after a network failure and restores them only after a successful reload', async () => {
    show();
    await expand();
    readFailure = new NetworkError(new Error('Offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Reload catalogue' }));
    await screen.findByText('Current catalogue values are unavailable.');
    expect(screen.queryByRole('heading', { name: 'Silent station' })).toBeNull();
    readFailure = null;
    fireEvent.click(screen.getByRole('button', { name: 'Reload catalogue' }));
    await screen.findByRole('heading', { name: 'Silent station' });
  });
  it('refuses another scope response and malformed history without rendering their contents', async () => {
    show();
    await expand();
    malformedRead = catalogue({ scope: 'event' });
    fireEvent.change(screen.getByLabelText('Catalogue scope'), { target: { value: 'station' } });
    await screen.findByText('Current catalogue values are unavailable.');
    malformedRead = undefined;
    fireEvent.click(screen.getByRole('button', { name: 'Reload catalogue' }));
    await screen.findByRole('heading', { name: 'Silent station' });
    malformedHistory = {
      ...catalogue({ scope: 'station', stationId: 'station' }),
      key: 'silentStationMinutes',
      data: [record({ values: { available: true, operation: 'set', before: 10, after: -5 } })],
      meta: { count: 1, nextCursor: null },
    };
    fireEvent.click(screen.getByRole('button', { name: 'View history: Silent station' }));
    await screen.findByText('Catalogue history is unavailable.');
    expect(screen.queryByText('After: -5 minutes')).toBeNull();
    malformedHistory = undefined;
    fireEvent.click(screen.getByRole('button', { name: 'Reload catalogue history' }));
    await screen.findByText('After: 20 minutes');
  });
  it.each(['event', 'person', 'signed-out'])(
    'remounts the reader and drops prior selection when the %s owner changes',
    async (change) => {
      const view = show();
      await expand();
      await history();
      if (change === 'event') owner.eventId = 'other-event';
      else owner.personId = change === 'person' ? 'another-manager' : '';
      view.rerender(<OperationalCataloguePanel enabled />);
      expect(screen.queryByRole('heading', { name: 'History: Silent station' })).toBeNull();
      if (change === 'signed-out')
        expect(screen.queryByRole('button', { name: 'Settings catalogue' })).toBeNull();
      else {
        expect(
          screen.getByRole('button', { name: 'Settings catalogue' }).getAttribute('aria-expanded'),
        ).toBe('false');
        await expand();
        expect(
          view.client.getQueryData(
            scopedSettingsKeys.current(owner.eventId, owner.personId, { scope: 'event' }),
          ),
        ).toBeTruthy();
      }
    },
  );
  it('renders empty severities and unavailable prior capture values clearly', () => {
    expect(catalogueValue('incident.pushSeverities', [])).toBe('None');
    expect(catalogueValue('capture.open', null)).toBe('Previous value unavailable');
    expect(catalogueValue('capture.open', false)).toBe('Paused');
  });
});
