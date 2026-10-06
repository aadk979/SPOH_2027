import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GENERATED_SETTING_DEFAULTS,
  GENERATED_SETTING_METADATA as metadata,
  scopedOperationalKeys,
  ScopedSettingsMutationRequest,
  type ScopedOperationalSetting,
  type ScopedOperationalSettingKey,
  type ScopedSettingsReadResponse,
  type ScopedSettingsTarget,
} from '@spoh/shared';
import { OperationalCataloguePanel } from '@/features/settings/components/OperationalCataloguePanel';
import { api } from '@/shared/lib/api';
import { ApiError, NetworkError } from '@/shared/lib/apiErrors';
import { scopedSettingsKeys } from '@/features/settings/queries';

const owner = vi.hoisted(() => ({ eventId: 'evt_test', personId: 'edit-manager' }));
vi.mock('@/shared/lib/eventContext', async (original) => ({
  ...(await original<typeof import('@/shared/lib/eventContext')>()),
  useEventId: () => owner.eventId,
}));
vi.mock('@/features/session', async (original) => ({
  ...(await original<typeof import('@/features/session')>()),
  useCurrentSession: () => ({ volunteerId: owner.personId }),
  useEventTime: () => ({ dateTime: (value: string) => `event-clock:${value}` }),
}));
vi.mock('@/features/stations', () => ({
  useStations: () => ({ data: [{ id: 'station', name: 'Entry station' }] }),
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api),
  clients: QueryClient[] = [];
let key: ScopedOperationalSettingKey, override: Partial<ScopedOperationalSetting>;
let status: ScopedSettingsReadResponse['eventStatus'],
  readFailure: Error | null,
  writeFailure: Error | null;
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
async function edit(input: { station?: boolean; reset?: boolean } = {}) {
  fireEvent.click(screen.getByRole('button', { name: 'Settings catalogue' }));
  await screen.findByRole('heading', { name: metadata[key].label });
  if (input.station) {
    fireEvent.change(screen.getByLabelText('Catalogue scope'), { target: { value: 'station' } });
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Edit catalogue:/ })).toHaveLength(3),
    );
  }
  fireEvent.click(
    screen.getByRole('button', {
      name: `${input.reset ? 'Remove override' : 'Edit catalogue'}: ${metadata[key].label}`,
    }),
  );
  await screen.findByRole('group', { name: 'Review catalogue change' });
}
function confirm() {
  fireEvent.change(screen.getByLabelText('Reason for catalogue change'), {
    target: { value: '  Reviewed generated setting  ' },
  });
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I have reviewed the current setting and the effects of this change',
    }),
  );
}
function writes() {
  return mockedApi.mock.calls.filter(([, options]) => options?.method === 'POST');
}
async function refetch(client: QueryClient) {
  await client.invalidateQueries({
    queryKey: scopedSettingsKeys.owner(owner.eventId, owner.personId),
  });
}
beforeEach(() => {
  owner.eventId = 'evt_test';
  owner.personId = 'edit-manager';
  key = 'silentStationMinutes';
  override = {};
  status = 'LIVE';
  readFailure = null;
  writeFailure = null;
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (path, options) => {
    if (options?.method === 'POST') {
      if (writeFailure) throw writeFailure;
      const body = ScopedSettingsMutationRequest.parse(options.body),
        version = body.expectedVersion + 1;
      override =
        body.operation === 'set'
          ? {
              value: body.value,
              source: { scope: body.target.scope, version },
              storedVersion: version,
            }
          : {};
      return {
        change: { id: 'own-change', key: body.key, operation: body.operation, version },
        reviewedVersion: body.expectedVersion,
        current: current(body.target),
      };
    }
    if (readFailure) throw readFailure;
    const params = new URL(path, 'https://fixture.invalid').searchParams;
    return current(
      params.get('scope') === 'station'
        ? { scope: 'station', stationId: params.get('stationId')! }
        : { scope: 'event' },
    );
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});
describe('reviewed generated catalogue editing', () => {
  it.each([false, true])('sends a scoped typed numeric write; station=%s', async (station) => {
    show();
    await edit({ station });
    const field = screen.getByLabelText('Proposed value');
    expect(field).toHaveProperty('min', '1');
    expect(field).toHaveProperty('max', '1440');
    fireEvent.change(field, { target: { value: '21' } });
    confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
    await screen.findByText('Catalogue change applied.');
    expect(writes()).toHaveLength(1);
    expect(ScopedSettingsMutationRequest.parse(writes()[0]![1]!.body)).toMatchObject({
      target: station ? { scope: 'station', stationId: 'station' } : { scope: 'event' },
      key,
      operation: 'set',
      value: 21,
      expectedVersion: 0,
      reason: 'Reviewed generated setting',
    });
  });
  it.each(['', '0', '1441', '1.5'])(
    'rejects blank/out-of-bounds/noninteger numeric input %j',
    async (value) => {
      show();
      await edit();
      fireEvent.change(screen.getByLabelText('Proposed value'), { target: { value } });
      confirm();
      fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
      await screen.findByText('Value does not match the registered setting');
      expect(writes()).toHaveLength(0);
    },
  );
  it('requires a reason and deliberate confirmation after every proposal change', async () => {
    show();
    await edit();
    expect(screen.getByRole('button', { name: 'Apply catalogue change' })).toHaveProperty(
      'disabled',
      true,
    );
    confirm();
    fireEvent.change(screen.getByLabelText('Proposed value'), { target: { value: '22' } });
    expect(screen.getByRole('checkbox', { name: /I have reviewed/ })).toHaveProperty(
      'checked',
      false,
    );
    expect(writes()).toHaveLength(0);
  });
  it('uses current inheritance for reviewed override removal', async () => {
    override = { value: 25, storedVersion: 4, source: { scope: 'event', version: 4 } };
    show();
    await edit({ reset: true });
    expect(screen.queryByLabelText('Proposed value')).toBeNull();
    expect(
      screen.getByText(/removes the selected override and uses current inheritance/),
    ).toBeTruthy();
    confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
    await screen.findByText('Catalogue change applied.');
    expect(writes()[0]![1]!.body).toMatchObject({ operation: 'reset', expectedVersion: 4 });
    expect(writes()[0]![1]!.body).not.toHaveProperty('value');
  });
  it('refuses fresh editing on archived events and removal without an override', async () => {
    status = 'ARCHIVED';
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Settings catalogue' }));
    await screen.findByRole('heading', { name: metadata[key].label });
    expect(
      screen.getByRole('button', { name: `Edit catalogue: ${metadata[key].label}` }),
    ).toHaveProperty('disabled', true);
    expect(
      screen.getByRole('button', { name: `Remove override: ${metadata[key].label}` }),
    ).toHaveProperty('disabled', true);
    expect(writes()).toHaveLength(0);
  });
  it('requires fresh review after source changes and preserves the explicit proposal', async () => {
    const { client } = show();
    await edit();
    fireEvent.change(screen.getByLabelText('Proposed value'), { target: { value: '24' } });
    confirm();
    override = { value: 17, source: { scope: 'platform', version: 2 } };
    await refetch(client);
    await screen.findByText('Catalogue settings changed after your review.');
    fireEvent.click(screen.getByRole('button', { name: 'Review current catalogue values' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Reason for catalogue change')).toHaveProperty('value', ''),
    );
    expect(screen.getByLabelText('Proposed value')).toHaveProperty('value', '24');
    expect(screen.getByRole('checkbox', { name: /I have reviewed/ })).toHaveProperty(
      'checked',
      false,
    );
    expect(writes()).toHaveLength(0);
  });
  it('locks an ambiguous request and safely retries the identical UUID/body after read failure', async () => {
    const { client } = show();
    await edit();
    confirm();
    writeFailure = new NetworkError('Uncertain response');
    fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
    await screen.findByRole('button', { name: 'Retry same catalogue change' });
    expect(screen.getByLabelText('Proposed value')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Catalogue scope')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Settings catalogue' })).toHaveProperty(
      'disabled',
      true,
    );
    readFailure = new NetworkError('Read unavailable');
    await refetch(client);
    await screen.findByText(
      'Current catalogue values are unavailable. Fresh changes require a new read.',
    );
    writeFailure = null;
    readFailure = null;
    fireEvent.click(screen.getByRole('button', { name: 'Retry same catalogue change' }));
    await screen.findByText('Catalogue change applied.');
    expect(writes()).toHaveLength(2);
    expect(writes()[1]![1]!.body).toEqual(writes()[0]![1]!.body);
  });
  it('clears private data and hides the editor after permission denial', async () => {
    const { client } = show();
    await edit();
    confirm();
    writeFailure = new ApiError(403, {
      code: 'FORBIDDEN',
      message: 'Private detail',
      requestId: 'test',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
    await screen.findByText('Settings catalogue access is unavailable. Reload your session.');
    expect(screen.queryByLabelText('Proposed value')).toBeNull();
    expect(
      client
        .getQueriesData({ queryKey: scopedSettingsKeys.owner(owner.eventId, owner.personId) })
        .every(([, data]) => data === undefined),
    ).toBe(true);
  });
  it('accepts fractional numeric metadata and writes a finite number', async () => {
    key = 'implausibleTapsPerMinute';
    show();
    await edit({ station: true });
    const field = screen.getByLabelText('Proposed value');
    expect(field).toHaveProperty('step', 'any');
    expect(field).toHaveProperty('max', '600');
    fireEvent.change(field, { target: { value: '2.5' } });
    confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
    await screen.findByText('Catalogue change applied.');
    expect(writes()[0]![1]!.body).toHaveProperty('value', 2.5);
  });
  it.each(['attendance.campusNetworkLabel', 'vocabulary.missionCard'] as const)(
    'uses generated string bounds and shared trimming for %s',
    async (selected) => {
      key = selected;
      show();
      await edit();
      const field = screen.getByLabelText('Proposed value');
      expect(field).toHaveProperty('maxLength', 40);
      fireEvent.change(field, { target: { value: '  Reviewed label  ' } });
      confirm();
      fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
      await screen.findByText('Catalogue change applied.');
      expect(writes()[0]![1]!.body).toHaveProperty('value', 'Reviewed label');
    },
  );
  it('maps string errors to the editable field and clears them on correction', async () => {
    key = 'vocabulary.missionCard';
    show();
    await edit();
    fireEvent.change(screen.getByLabelText('Proposed value'), { target: { value: ' '.repeat(4) } });
    confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
    await screen.findByText('Value does not match the registered setting');
    expect(writes()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Proposed value'), { target: { value: 'New card' } });
    expect(screen.queryByText('Value does not match the registered setting')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /I have reviewed/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
    await screen.findByText('Catalogue change applied.');
  });
  it('renders numeric choices from anyOf constants and writes a numeric value', async () => {
    key = 'report.curveBucketMinutes';
    show();
    await edit();
    const field = screen.getByLabelText('Proposed value') as HTMLSelectElement;
    expect(Array.from(field.options, (option) => option.value)).toEqual(['15', '30', '60']);
    fireEvent.change(field, { target: { value: '60' } });
    confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
    await screen.findByText('Catalogue change applied.');
    expect(writes()[0]![1]!.body).toHaveProperty('value', 60);
  });
  it('writes boolean false without string conversion', async () => {
    key = 'capture.open';
    show();
    await edit();
    fireEvent.click(screen.getByLabelText('Proposed value'));
    confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
    await screen.findByText('Catalogue change applied.');
    expect(writes()[0]![1]!.body).toHaveProperty('value', false);
  });
  it('uses generated enum options and permits an empty severity selection', async () => {
    key = 'incident.pushSeverities';
    show();
    await edit();
    expect(screen.getByLabelText('LOW')).toBeTruthy();
    expect(screen.getByLabelText('MEDIUM')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('HIGH'));
    fireEvent.click(screen.getByLabelText('CRITICAL'));
    confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
    await screen.findByText('Catalogue change applied.');
    expect(writes()[0]![1]!.body).toHaveProperty('value', []);
  });
  it('does not mark an unchanged array refetch stale', async () => {
    key = 'incident.pushSeverities';
    const { client } = show();
    await edit();
    confirm();
    await refetch(client);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply catalogue change' })).toHaveProperty(
        'disabled',
        false,
      ),
    );
    expect(screen.queryByText('Catalogue settings changed after your review.')).toBeNull();
  });
  it('freezes pending fields, scope and navigation and prevents duplicate taps', async () => {
    show();
    await edit();
    confirm();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const original = mockedApi.getMockImplementation()!;
    mockedApi.mockImplementation(async (path, options) => {
      if (options?.method === 'POST') await pending;
      return original(path, options);
    });
    const apply = screen.getByRole('button', { name: 'Apply catalogue change' });
    fireEvent.click(apply);
    fireEvent.click(apply);
    await waitFor(() =>
      expect(screen.getByLabelText('Proposed value')).toHaveProperty('disabled', true),
    );
    expect(writes()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Back to catalogue values' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: 'Settings catalogue' })).toHaveProperty(
      'disabled',
      true,
    );
    finish();
    await screen.findByText('Catalogue change applied.');
    expect(screen.getByRole('button', { name: 'Back to catalogue values' })).toHaveProperty(
      'disabled',
      false,
    );
  });
  it('blocks a fresh request after current read failure', async () => {
    const { client } = show();
    await edit();
    confirm();
    readFailure = new NetworkError('Read unavailable');
    await refetch(client);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply catalogue change' })).toHaveProperty(
        'disabled',
        true,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
    expect(writes()).toHaveLength(0);
  });
  it('retains the old ambiguous intent across archive and a newer value', async () => {
    const { client } = show();
    await edit();
    confirm();
    writeFailure = new NetworkError('Uncertain');
    fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
    await screen.findByRole('button', { name: 'Retry same catalogue change' });
    status = 'ARCHIVED';
    override = { value: 23, storedVersion: 9, source: { scope: 'event', version: 9 } };
    await refetch(client);
    expect(screen.getByRole('button', { name: 'Retry same catalogue change' })).toHaveProperty(
      'disabled',
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry same catalogue change' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]![1]!.body).toEqual(writes()[0]![1]!.body);
  });
  it('clears confirmation and creates a fresh UUID after a version conflict', async () => {
    show();
    await edit();
    confirm();
    writeFailure = new ApiError(409, {
      code: 'SETTING_VERSION_CONFLICT',
      message: 'Conflict',
      requestId: 'test',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
    await screen.findByRole('button', { name: 'Review current catalogue values' });
    override = { value: 26, storedVersion: 7, source: { scope: 'event', version: 7 } };
    fireEvent.click(screen.getByRole('button', { name: 'Review current catalogue values' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Reason for catalogue change')).toHaveProperty('value', ''),
    );
    expect(screen.getByLabelText('Proposed value')).toHaveProperty('value', '15');
    writeFailure = null;
    confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
    await screen.findByText('Catalogue change applied.');
    const first = ScopedSettingsMutationRequest.parse(writes()[0]![1]!.body);
    const second = ScopedSettingsMutationRequest.parse(writes()[1]![1]!.body);
    expect(second.expectedVersion).toBe(7);
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });
  it('retains a blocked review when its refresh fails', async () => {
    show();
    await edit();
    confirm();
    writeFailure = new ApiError(409, {
      code: 'SETTING_VERSION_CONFLICT',
      message: 'Conflict',
      requestId: 'test',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
    await screen.findByRole('button', { name: 'Review current catalogue values' });
    readFailure = new NetworkError('Read unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Review current catalogue values' }));
    await screen.findByText('Current catalogue values are unavailable. Reload before reviewing.');
    expect(screen.getByLabelText('Reason for catalogue change')).toHaveProperty(
      'value',
      '  Reviewed generated setting  ',
    );
    expect(screen.getByRole('button', { name: 'Apply catalogue change' })).toHaveProperty(
      'disabled',
      true,
    );
  });
  it('refuses a cross-event receipt and keeps the request uncertain', async () => {
    show();
    await edit();
    confirm();
    const original = mockedApi.getMockImplementation()!;
    mockedApi.mockImplementation(async (path, options) => {
      const result = await original(path, options);
      if (options?.method === 'POST')
        return {
          ...(result as object),
          current: { ...current({ scope: 'event' }), eventId: 'other-event' },
        };
      return result;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply catalogue change' }));
    await screen.findByRole('button', { name: 'Retry same catalogue change' });
    expect(screen.queryByText('Catalogue change applied.')).toBeNull();
    expect(screen.getByLabelText('Proposed value')).toHaveProperty('disabled', true);
  });
  it('remounts a collapsed owner after the current person changes', async () => {
    const rendered = show();
    await edit();
    owner.personId = 'other-person';
    rendered.rerender(<OperationalCataloguePanel enabled />);
    expect(screen.queryByRole('group', { name: 'Review catalogue change' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Settings catalogue' }).getAttribute('aria-expanded'),
    ).toBe('false');
  });
});
