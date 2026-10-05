import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GENERATED_SETTING_DEFAULTS,
  GENERATED_SETTING_METADATA as metadata,
  scopedOperationalKeys,
  ScopedSettingsRevertRequest,
  type ScopedOperationalSetting,
  type ScopedOperationalSettingKey,
  type ScopedSettingsReadResponse,
  type ScopedSettingsTarget,
  type ScopedSettingsHistoryRecord,
  type ScopedSettingsRevertResponse,
} from '@spoh/shared';
import { OperationalCataloguePanel } from '@/features/settings/components/OperationalCataloguePanel';
import { api } from '@/shared/lib/api';
import { ApiError, NetworkError } from '@/shared/lib/apiErrors';
import { scopedSettingsKeys } from '@/features/settings/queries';
import { scopedSettingReviewChanged } from '@/shared/lib/scopedSettingReview';

const owner = vi.hoisted(() => ({ eventId: 'evt_test', personId: 'restore-manager' }));
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
  useStations: () => ({ data: [{ id: 'station', name: 'Entry station' }] }),
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const clients: QueryClient[] = [];
let key: ScopedOperationalSettingKey;
let saved: ScopedSettingsHistoryRecord;
let override: Partial<ScopedOperationalSetting>;
let status: ScopedSettingsReadResponse['eventStatus'];
let readFailure: Error | null, writeFailure: Error | null;
function current(target: ScopedSettingsTarget): ScopedSettingsReadResponse {
  return {
    eventId: owner.eventId,
    target,
    eventStatus: status,
    evaluatedAt: '2027-01-01T03:00:00Z',
    data: scopedOperationalKeys(target.scope).map((selected) => ({
      key: selected,
      value: GENERATED_SETTING_DEFAULTS[selected],
      source: { scope: 'default', version: 0 },
      storedVersion: 0,
      invalidScopes: [],
      ...(selected === key ? override : {}),
    })),
  };
}
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return {
    client,
    ...render(<OperationalCataloguePanel enabled />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}
async function history(station = false) {
  fireEvent.click(screen.getByRole('button', { name: 'Settings catalogue' }));
  await screen.findByRole('heading', { name: metadata[key].label });
  if (station) {
    fireEvent.change(screen.getByLabelText('Catalogue scope'), { target: { value: 'station' } });
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^View history:/ })).toHaveLength(3),
    );
  }
  fireEvent.click(screen.getByRole('button', { name: `View history: ${metadata[key].label}` }));
  await screen.findByRole('heading', { name: `History: ${metadata[key].label}` });
}
async function review(station = false) {
  await history(station);
  fireEvent.click(
    screen.getByRole('button', { name: `Review catalogue version ${saved.version}` }),
  );
  await screen.findByRole('group', { name: 'Review catalogue restore' });
}
function confirm() {
  fireEvent.change(screen.getByLabelText('Reason for catalogue restore'), {
    target: { value: '  Reviewed operational history  ' },
  });
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I have reviewed the current setting and the effects of this restore',
    }),
  );
}
function writes() {
  return mockedApi.mock.calls.filter(([, options]) => options?.method === 'POST');
}
function denial() {
  return new ApiError(403, {
    code: 'FORBIDDEN',
    message: 'Private server detail',
    requestId: 'test',
  });
}
beforeEach(() => {
  owner.eventId = 'evt_test';
  owner.personId = 'restore-manager';
  key = 'silentStationMinutes';
  status = 'LIVE';
  override = {};
  readFailure = null;
  writeFailure = null;
  saved = {
    id: 'saved-history',
    key,
    version: 2,
    source: 'USER',
    createdAt: '2027-01-01T02:00:00Z',
    createdByYou: true,
    reason: 'Prior operational review',
    values: { available: true, operation: 'set', before: 15, after: 20 },
  };
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (path, options) => {
    if (options?.method === 'POST') {
      if (writeFailure) throw writeFailure;
      const body = ScopedSettingsRevertRequest.parse(options.body);
      const values = saved.values;
      if (!values.available) throw new Error('Unavailable history');
      const version = Math.max(body.expectedVersion, saved.version) + 1;
      const beforeValue = current(body.target).data.find((row) => row.key === body.key)!.value;
      override =
        values.operation === 'set'
          ? {
              value: values.after,
              source: { scope: body.target.scope, version },
              storedVersion: version,
            }
          : {};
      return {
        reviewedVersion: body.expectedVersion,
        current: current(body.target),
        revertedFrom: { historyId: saved.id, version: saved.version, operation: values.operation },
        history: {
          ...saved,
          id: 'restored-history',
          version,
          source: values.operation === 'set' ? 'REVERT' : 'RESET',
          values:
            values.operation === 'set'
              ? { ...values, before: beforeValue }
              : { available: true, operation: 'reset', before: beforeValue },
        },
      };
    }
    if (readFailure && !path.includes('/history?')) throw readFailure;
    const params = new URL(path, 'https://fixture.invalid').searchParams;
    const target: ScopedSettingsTarget =
      params.get('scope') === 'station'
        ? { scope: 'station', stationId: params.get('stationId')! }
        : { scope: 'event' };
    if (path.includes('/history?'))
      return { ...current(target), key, data: [saved], meta: { count: 1, nextCursor: null } };
    return current(target);
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe('reviewed operational catalogue restores', () => {
  for (const station of [false, true])
    it(`uses the reviewed owned history and current version at ${station ? 'station' : 'event'} scope`, async () => {
      show();
      await review(station);
      const apply = screen.getByRole('button', { name: 'Restore catalogue setting' });
      expect(apply).toHaveProperty('disabled', true);
      fireEvent.click(apply);
      expect(writes()).toHaveLength(0);
      confirm();
      fireEvent.click(apply);
      await screen.findByText('Catalogue restore applied.');
      const [path, options] = writes()[0]!;
      expect(path).toBe('/events/evt_test/admin/settings/catalogue/revert');
      const body = ScopedSettingsRevertRequest.parse(options!.body);
      expect(body).toEqual({
        target: station ? { scope: 'station', stationId: 'station' } : { scope: 'event' },
        key,
        historyId: saved.id,
        expectedVersion: 0,
        reason: 'Reviewed operational history',
        idempotencyKey: expect.any(String),
      });
      expect(Object.keys(body)).not.toContain('value');
      expect(options!.cache).toBe('no-store');
    });
  for (const [selected, after] of [
    ['attendance.campusNetworkLabel', 'Hall network'],
    ['incident.pushSeverities', ['LOW', 'HIGH']],
  ] as const)
    it(`reviews a validated ${selected} value without an arbitrary JSON input`, async () => {
      key = selected;
      saved = {
        ...saved,
        key,
        values: {
          available: true,
          operation: 'set',
          before: GENERATED_SETTING_DEFAULTS[key],
          after: typeof after === 'string' ? after : [...after],
        },
      };
      show();
      await review();
      expect(screen.queryByLabelText('Setting JSON')).toBeNull();
      confirm();
      fireEvent.click(screen.getByRole('button', { name: 'Restore catalogue setting' }));
      await screen.findByText('Catalogue restore applied.');
      expect(ScopedSettingsRevertRequest.parse(writes()[0]![1]!.body).key).toBe(key);
    });
  it('restores override removal with current inheritance and does not invent the old inherited value', async () => {
    override = { value: 20, storedVersion: 4, source: { scope: 'event', version: 4 } };
    saved = {
      ...saved,
      version: 3,
      source: 'RESET',
      values: { available: true, operation: 'reset', before: 20 },
    };
    show();
    await review();
    expect(screen.getByText(/uses current inheritance/)).toBeTruthy();
    confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Restore catalogue setting' }));
    await screen.findByText('Catalogue restore applied.');
    expect(ScopedSettingsRevertRequest.parse(writes()[0]![1]!.body).expectedVersion).toBe(4);
  });
  it('refuses fresh restores for an archived event', async () => {
    status = 'ARCHIVED';
    show();
    await history();
    expect(screen.getByRole('button', { name: 'Review catalogue version 2' })).toHaveProperty(
      'disabled',
      true,
    );
  });
  it('does not offer unavailable historical values', async () => {
    saved = { ...saved, values: { available: false } };
    show();
    await history();
    expect(screen.queryByRole('button', { name: 'Review catalogue version 2' })).toBeNull();
  });
  it('refuses RESET when this scope already inherits', async () => {
    saved = {
      ...saved,
      source: 'RESET',
      values: { available: true, operation: 'reset', before: 20 },
    };
    show();
    await history();
    expect(screen.getByRole('button', { name: 'Review catalogue version 2' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(
      screen.getByText('This scope already inherits a value. There is no override to remove.'),
    ).toBeTruthy();
  });
  it('invalidates confirmation when inheritance changes and demands current review', async () => {
    const { client } = show();
    await review();
    confirm();
    override = { value: 30, source: { scope: 'platform', version: 5 } };
    await client.invalidateQueries({
      queryKey: scopedSettingsKeys.owner(owner.eventId, owner.personId),
    });
    await screen.findByText('Catalogue settings changed after your review.');
    expect(screen.getByRole('button', { name: 'Restore catalogue setting' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review current catalogue values' }));
    await waitFor(() => expect(screen.getByRole('checkbox')).toHaveProperty('checked', false));
    expect(screen.getByLabelText('Reason for catalogue restore')).toHaveProperty('value', '');
  });
  it('freezes exactly one intent through an ambiguous response and a subsequent read failure', async () => {
    const { client } = show();
    await review();
    confirm();
    writeFailure = new NetworkError('Synthetic unavailable receipt');
    fireEvent.click(screen.getByRole('button', { name: 'Restore catalogue setting' }));
    await screen.findByRole('button', { name: 'Retry same catalogue restore' });
    const first = writes()[0]![1]!.body;
    expect(screen.getByLabelText('Catalogue scope')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Settings catalogue' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByLabelText('Reason for catalogue restore')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Back to catalogue history' })).toHaveProperty(
      'disabled',
      true,
    );
    readFailure = new NetworkError('Synthetic unavailable current read');
    await client.invalidateQueries({
      queryKey: scopedSettingsKeys.owner(owner.eventId, owner.personId),
    });
    expect(screen.getByRole('button', { name: 'Retry same catalogue restore' })).toHaveProperty(
      'disabled',
      false,
    );
    readFailure = null;
    writeFailure = null;
    fireEvent.click(screen.getByRole('button', { name: 'Retry same catalogue restore' }));
    await screen.findByText('Catalogue restore applied.');
    expect(writes()[1]![1]!.body).toEqual(first);
  });
  it('clears owned private data and hides the review after fresh denial', async () => {
    const { client } = show();
    await review();
    confirm();
    writeFailure = denial();
    fireEvent.click(screen.getByRole('button', { name: 'Restore catalogue setting' }));
    await screen.findByText('Settings catalogue access is unavailable. Reload your session.');
    expect(screen.queryByRole('group', { name: 'Review catalogue restore' })).toBeNull();
    expect(
      client.getQueryData(
        scopedSettingsKeys.current(owner.eventId, owner.personId, { scope: 'event' }),
      ),
    ).toBeUndefined();
    expect(screen.queryByText('Private server detail')).toBeNull();
  });
  it('remounts a collapsed empty owner when the person changes', async () => {
    const view = show();
    await review();
    owner.personId = 'replacement-manager';
    view.rerender(<OperationalCataloguePanel enabled />);
    expect(
      screen.getByRole('button', { name: 'Settings catalogue' }).getAttribute('aria-expanded'),
    ).toBe('false');
    expect(screen.queryByRole('group', { name: 'Review catalogue restore' })).toBeNull();
  });
  it('treats a newly fetched identical array as the same reviewed value', () => {
    const row: ScopedOperationalSetting = {
      key: 'incident.pushSeverities',
      value: ['HIGH', 'CRITICAL'],
      storedVersion: 1,
      source: { scope: 'event', version: 1 },
      invalidScopes: [],
    };
    expect(scopedSettingReviewChanged(row, { ...row, value: ['HIGH', 'CRITICAL'] })).toBe(false);
    expect(scopedSettingReviewChanged(row, { ...row, value: ['LOW'] })).toBe(true);
    expect(
      scopedSettingReviewChanged(row, { ...row, source: { scope: 'event', version: 2 } }),
    ).toBe(true);
  });
  it('keeps an unchanged array review valid after a real query refetch', async () => {
    key = 'incident.pushSeverities';
    override = {
      value: ['HIGH', 'CRITICAL'],
      storedVersion: 4,
      source: { scope: 'event', version: 4 },
    };
    saved = {
      ...saved,
      key,
      values: { available: true, operation: 'set', before: ['HIGH'], after: ['LOW', 'HIGH'] },
    };
    const { client } = show();
    await review();
    confirm();
    override = { ...override, value: ['HIGH', 'CRITICAL'] };
    await client.invalidateQueries({
      queryKey: scopedSettingsKeys.owner(owner.eventId, owner.personId),
    });
    expect(screen.queryByText('Catalogue settings changed after your review.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore catalogue setting' })).toHaveProperty(
      'disabled',
      false,
    );
  });
  it('blocks a fresh reviewed restore while the current read is unavailable', async () => {
    const { client } = show();
    await review();
    confirm();
    readFailure = new NetworkError('Synthetic unavailable current read');
    await client.invalidateQueries({
      queryKey: scopedSettingsKeys.owner(owner.eventId, owner.personId),
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Restore catalogue setting' })).toHaveProperty(
        'disabled',
        true,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Restore catalogue setting' }));
    expect(writes()).toHaveLength(0);
  });
  it('blocks a fresh review when the event becomes archived', async () => {
    const { client } = show();
    await review();
    confirm();
    status = 'ARCHIVED';
    await client.invalidateQueries({
      queryKey: scopedSettingsKeys.owner(owner.eventId, owner.personId),
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Restore catalogue setting' })).toHaveProperty(
        'disabled',
        true,
      ),
    );
    expect(writes()).toHaveLength(0);
  });
  it('preserves an ambiguous retry after archive without building a new request', async () => {
    const { client } = show();
    await review();
    confirm();
    writeFailure = new NetworkError('Synthetic ambiguous outcome');
    fireEvent.click(screen.getByRole('button', { name: 'Restore catalogue setting' }));
    await screen.findByRole('button', { name: 'Retry same catalogue restore' });
    const first = writes()[0]![1]!.body;
    status = 'ARCHIVED';
    await client.invalidateQueries({
      queryKey: scopedSettingsKeys.owner(owner.eventId, owner.personId),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry same catalogue restore' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]![1]!.body).toEqual(first);
  });
  it('retains the review and error if a requested current review cannot be loaded', async () => {
    show();
    await review();
    confirm();
    writeFailure = new ApiError(409, {
      code: 'SETTING_VERSION_CONFLICT',
      message: 'Private conflict',
      requestId: 'test',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restore catalogue setting' }));
    await screen.findByRole('button', { name: 'Review current catalogue values' });
    readFailure = new NetworkError('Synthetic failed reviewed read');
    fireEvent.click(screen.getByRole('button', { name: 'Review current catalogue values' }));
    await screen.findByText('Current catalogue values are unavailable. Reload before reviewing.');
    expect(screen.getByRole('button', { name: 'Restore catalogue setting' })).toHaveProperty(
      'disabled',
      true,
    );
  });
  it('clears old confirmation and retry intent after a version conflict and a new review', async () => {
    show();
    await review();
    confirm();
    writeFailure = new ApiError(409, {
      code: 'SETTING_VERSION_CONFLICT',
      message: 'Private conflict',
      requestId: 'test',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restore catalogue setting' }));
    await screen.findByRole('button', { name: 'Review current catalogue values' });
    const first = ScopedSettingsRevertRequest.parse(writes()[0]![1]!.body);
    override = { value: 35, storedVersion: 5, source: { scope: 'event', version: 5 } };
    writeFailure = null;
    fireEvent.click(screen.getByRole('button', { name: 'Review current catalogue values' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Reason for catalogue restore')).toHaveProperty('value', ''),
    );
    confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Restore catalogue setting' }));
    await screen.findByText('Catalogue restore applied.');
    const second = ScopedSettingsRevertRequest.parse(writes()[1]![1]!.body);
    expect(second.expectedVersion).toBe(5);
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });
  it('keeps a pending restore locked and sends only one request', async () => {
    show();
    await review();
    confirm();
    const implementation = mockedApi.getMockImplementation()!;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockedApi.mockImplementation(async (path, options) => {
      if (options?.method === 'POST') await pending;
      return implementation(path, options);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restore catalogue setting' }));
    await screen.findByRole('button', { name: 'Restoring…' });
    expect(screen.getByLabelText('Catalogue scope')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Back to catalogue history' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Restoring…' }));
    expect(writes()).toHaveLength(1);
    release();
    await screen.findByText('Catalogue restore applied.');
  });
  it('refuses a cross-event receipt and retains the same ambiguous request', async () => {
    show();
    await review();
    confirm();
    const implementation = mockedApi.getMockImplementation()!;
    mockedApi.mockImplementation(async (path, options) => {
      const result = await implementation(path, options);
      if (options?.method !== 'POST') return result;
      const response = result as ScopedSettingsRevertResponse;
      return { ...response, current: { ...response.current, eventId: 'foreign-event' } };
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restore catalogue setting' }));
    await screen.findByRole('button', { name: 'Retry same catalogue restore' });
    expect(screen.queryByText('Catalogue restore applied.')).toBeNull();
    expect(writes()).toHaveLength(1);
  });
});
