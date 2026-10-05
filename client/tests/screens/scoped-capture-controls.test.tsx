import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GENERATED_SETTING_DEFAULTS,
  scopedOperationalKeys,
  type ScopedSettingsReadResponse,
  type ScopedSettingsTarget,
  type ScopedSettingsHistoryRecord,
  type ScopedSettingsMutationRequest,
  type ScopedSettingsRevertRequest,
} from '@spoh/shared';
import { CaptureControlsPanel } from '@/features/settings/components/CaptureControlsPanel';
import { api } from '@/shared/lib/api';
import { TEST_EVENT } from '../helpers/event';
import { ApiError, NetworkError } from '@/shared/lib/apiErrors';
import { scopedSettingsKeys } from '@/features/settings/queries';
import {
  changeScopedSetting,
  getScopedSettings,
  getScopedSettingHistory,
  revertScopedSetting,
} from '@/features/settings/api';

const session = vi.hoisted(() => ({ personId: 'capture-manager', eventId: 'evt_test' }));
vi.mock('@/shared/lib/eventContext', async (original) => ({
  ...(await original<typeof import('@/shared/lib/eventContext')>()),
  useEventId: () => session.eventId,
}));
vi.mock('@/features/session', async (original) => ({
  ...(await original<typeof import('@/features/session')>()),
  useCurrentSession: () => (session.personId ? { volunteerId: session.personId } : null),
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
const endpoint = `/events/${TEST_EVENT.id}/admin/settings/catalogue`;
let current: ScopedSettingsReadResponse;
let historyRows: ScopedSettingsHistoryRecord[];
let failure: Error | null;
function read(target: ScopedSettingsTarget = { scope: 'event' }): ScopedSettingsReadResponse {
  return {
    eventId: TEST_EVENT.id,
    target,
    eventStatus: 'LIVE',
    evaluatedAt: '2027-01-01T03:00:00Z',
    data: scopedOperationalKeys(target.scope).map((key) => ({
      key,
      value: GENERATED_SETTING_DEFAULTS[key],
      source: { scope: 'default', version: 0 },
      storedVersion: 0,
      invalidScopes: [],
    })),
  };
}
function show(enabled = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return {
    client,
    ...render(<CaptureControlsPanel enabled={enabled} />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}
function writes() {
  return mockedApi.mock.calls.filter(([, options]) => options?.method === 'POST');
}
function historyRow(
  overrides: Partial<ScopedSettingsHistoryRecord> = {},
): ScopedSettingsHistoryRecord {
  return {
    id: 'history-1',
    key: 'capture.open',
    version: 1,
    source: 'USER',
    createdAt: '2027-01-01T02:00:00Z',
    createdByYou: true,
    reason: 'Reviewed prior pause',
    values: { available: true, operation: 'set', before: true, after: false },
    ...overrides,
  };
}
function historyPage(rows = historyRows, cursor: string | null = null) {
  return {
    ...current,
    key: 'capture.open',
    data: rows,
    meta: { count: rows.length, nextCursor: cursor },
  };
}
function setting(overrides: Partial<ScopedSettingsReadResponse['data'][number]>) {
  current = {
    ...current,
    data: current.data.map((row) => (row.key === 'capture.open' ? { ...row, ...overrides } : row)),
  };
}
function response(body: ScopedSettingsMutationRequest | ScopedSettingsRevertRequest) {
  if ('historyId' in body) {
    const selected = historyRows.find(({ id }) => id === body.historyId)!;
    const operation = selected.values.available ? selected.values.operation : 'set';
    return {
      history: historyRow({
        id: 'new-history',
        version: Math.max(body.expectedVersion, selected.version) + 1,
        source: operation === 'reset' ? 'RESET' : 'REVERT',
        reason: body.reason,
        values:
          operation === 'reset' ? { available: true, operation, before: false } : selected.values,
      }),
      current,
      reviewedVersion: body.expectedVersion,
      revertedFrom: { historyId: selected.id, version: selected.version, operation },
    };
  }
  return {
    change: {
      id: 'new-change',
      key: body.key,
      operation: body.operation,
      version: body.expectedVersion + 1,
    },
    reviewedVersion: body.expectedVersion,
    current,
  };
}
async function choosePause() {
  await expand();
  fireEvent.click(screen.getByRole('button', { name: 'Review pause' }));
}
function confirm(reason = 'Reviewed synthetic capture change') {
  fireEvent.change(screen.getByLabelText('Reason for capture change'), {
    target: { value: reason },
  });
  fireEvent.click(screen.getByRole('checkbox'));
}
function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Apply capture change' }));
}
async function expand() {
  fireEvent.click(screen.getByRole('button', { name: 'Capture controls' }));
  await screen.findByText('Effective capture: Open');
}
beforeEach(() => {
  session.personId = 'capture-manager';
  session.eventId = TEST_EVENT.id;
  current = read();
  historyRows = [historyRow()];
  failure = null;
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (path, options) => {
    if (options?.method === 'POST') {
      if (failure) throw failure;
      return response(options.body as ScopedSettingsMutationRequest | ScopedSettingsRevertRequest);
    }
    if (path.includes('/history?')) return historyPage();
    return current;
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe('scoped capture controls', () => {
  it('reads privately only after expansion and explains scope, inheritance and capture limits', async () => {
    show();
    expect(mockedApi).not.toHaveBeenCalled();
    await expand();
    expect(mockedApi).toHaveBeenCalledWith(`${endpoint}?scope=event`, { cache: 'no-store' });
    expect(screen.getByText('Inherited from the registered default')).toBeTruthy();
    expect(screen.getByText(/Safety reports remain available/)).toBeTruthy();
    expect(screen.getByText(/event schedule and lifecycle still apply/)).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });
  it('requires a reason and confirmation before sending the reviewed selected version', async () => {
    mockedApi.mockImplementation(async (_path, options) => {
      if (options?.method !== 'POST') return current;
      const body = options.body as { operation: 'set'; expectedVersion: number };
      return {
        change: { id: 'new-change', key: 'capture.open', operation: body.operation, version: 1 },
        reviewedVersion: body.expectedVersion,
        current,
      };
    });
    show();
    await expand();
    fireEvent.click(screen.getByRole('button', { name: 'Review pause' }));
    expect(screen.getByRole('button', { name: 'Apply capture change' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.change(screen.getByLabelText('Reason for capture change'), {
      target: { value: ' Pause for the reviewed operation ' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply capture change' }));
    await screen.findByText('Capture change applied.');
    expect(writes()).toHaveLength(1);
    expect(writes()[0]![1]!.body).toMatchObject({
      operation: 'set',
      target: { scope: 'event' },
      key: 'capture.open',
      value: false,
      expectedVersion: 0,
      reason: 'Pause for the reviewed operation',
    });
  });
  it('reviews a station using its selected stored version, rather than the inherited event version', async () => {
    show();
    await expand();
    current = read({ scope: 'station', stationId: 'station' });
    setting({ source: { scope: 'event', version: 9 }, storedVersion: 0 });
    fireEvent.change(screen.getByLabelText('Capture scope'), { target: { value: 'station' } });
    await screen.findByText('Inherited from event settings');
    expect(mockedApi).toHaveBeenCalledWith(`${endpoint}?scope=station&stationId=station`, {
      cache: 'no-store',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review pause' }));
    confirm();
    submit();
    await screen.findByText('Capture change applied.');
    expect(writes()[0]![1]!.body).toMatchObject({
      target: { scope: 'station', stationId: 'station' },
      expectedVersion: 0,
    });
  });
  it('removes only a selected override through an explicit reviewed reset', async () => {
    setting({ value: false, storedVersion: 2, source: { scope: 'event', version: 2 } });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Capture controls' }));
    await screen.findByText('Effective capture: Paused');
    fireEvent.click(screen.getByRole('button', { name: 'Review removing override' }));
    expect(screen.getByText(/Earlier inherited values are not reconstructed/)).toBeTruthy();
    confirm();
    submit();
    await screen.findByText('Capture change applied.');
    expect(writes()[0]![1]!.body).toMatchObject({ operation: 'reset', expectedVersion: 2 });
    expect(writes()[0]![1]!.body).not.toHaveProperty('value');
  });
  it('marks a reviewed inherited value stale when its parent changes without a selected override', async () => {
    const view = show();
    await expand();
    current = read({ scope: 'station', stationId: 'station' });
    setting({ source: { scope: 'event', version: 8 } });
    fireEvent.change(screen.getByLabelText('Capture scope'), { target: { value: 'station' } });
    await screen.findByText('Inherited from event settings');
    fireEvent.click(screen.getByRole('button', { name: 'Review pause' }));
    confirm();
    setting({ value: false, source: { scope: 'event', version: 9 } });
    view.client.setQueryData(
      scopedSettingsKeys.current(TEST_EVENT.id, session.personId, current.target),
      current,
    );
    await screen.findByText('Capture settings changed after your review.');
    expect(screen.getByRole('button', { name: 'Apply capture change' })).toHaveProperty(
      'disabled',
      true,
    );
    submit();
    expect(writes()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Review current capture values' }));
    await screen.findByText(/Reviewed capture: Paused/);
    expect(screen.getByLabelText('Reason for capture change')).toHaveProperty('value', '');
    expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
  });
  it('freezes reason, scope and UUID after a lost response while allowing the exact retry against newer reads', async () => {
    failure = new NetworkError('synthetic lost response');
    const view = show();
    await choosePause();
    confirm();
    submit();
    await screen.findByText(/The outcome is unavailable/);
    const first = writes()[0]![1]!.body;
    expect(screen.getByLabelText('Reason for capture change')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Capture scope')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Capture controls' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: 'Back to capture controls' })).toHaveProperty(
      'disabled',
      true,
    );
    setting({ value: false, storedVersion: 4, source: { scope: 'event', version: 4 } });
    view.client.setQueryData(
      scopedSettingsKeys.current(TEST_EVENT.id, session.personId, current.target),
      current,
    );
    failure = null;
    fireEvent.click(screen.getByRole('button', { name: 'Retry same capture change' }));
    await screen.findByText('Capture change applied.');
    expect(writes()[1]![1]!.body).toEqual(first);
    expect(screen.getByLabelText('Capture scope')).toHaveProperty('disabled', false);
  });
  it('retains an uncertain request through a failed current-value refresh', async () => {
    failure = new NetworkError('synthetic loss');
    const view = show();
    await choosePause();
    confirm();
    submit();
    await screen.findByText(/The outcome is unavailable/);
    const first = writes()[0]![1]!.body;
    mockedApi.mockRejectedValue(new NetworkError('synthetic read loss'));
    await view.client.invalidateQueries({
      queryKey: scopedSettingsKeys.current(TEST_EVENT.id, session.personId, current.target),
    });
    await screen.findByText(/Current capture settings are unavailable/);
    expect(screen.getByRole('button', { name: 'Retry same capture change' })).toHaveProperty(
      'disabled',
      false,
    );
    mockedApi.mockImplementation(async (_path, options) =>
      options?.method === 'POST'
        ? response(options.body as ScopedSettingsMutationRequest)
        : current,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry same capture change' }));
    await screen.findByText('Capture change applied.');
    expect(writes()[1]![1]!.body).toEqual(first);
  });
  it('blocks a version conflict until re-review clears the reason, confirmation and retry UUID', async () => {
    failure = new ApiError(409, {
      code: 'SETTING_VERSION_CONFLICT',
      message: 'private detail',
      requestId: 'fixture',
    });
    show();
    await choosePause();
    confirm();
    submit();
    await screen.findByText(/Capture settings changed after your review. Review current/);
    const first = writes()[0]![1]!.body;
    expect(screen.queryByText('private detail')).toBeNull();
    expect(screen.getByRole('button', { name: 'Apply capture change' })).toHaveProperty(
      'disabled',
      true,
    );
    setting({ storedVersion: 4, source: { scope: 'event', version: 4 } });
    fireEvent.click(screen.getByRole('button', { name: 'Review current capture values' }));
    await screen.findByText(/Reviewed capture: Open · Selected scope version 4/);
    expect(screen.getByLabelText('Reason for capture change')).toHaveProperty('value', '');
    expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
    failure = null;
    confirm();
    submit();
    await screen.findByText('Capture change applied.');
    expect(writes()[1]![1]!.body).toMatchObject({ expectedVersion: 4 });
    expect(writes()[1]![1]!.body).not.toEqual(first);
  });
  it.each([401, 403])(
    'hides all private values and review after a %s write denial',
    async (status) => {
      failure = new ApiError(status, {
        code: 'FORBIDDEN',
        message: 'private detail',
        requestId: 'fixture',
      });
      show();
      await choosePause();
      confirm();
      submit();
      await screen.findByRole('alert');
      await waitFor(() => expect(screen.queryByText(/Effective capture:/)).toBeNull());
      expect(screen.queryByLabelText('Reason for capture change')).toBeNull();
      expect(screen.queryByText('private detail')).toBeNull();
      expect(screen.getByLabelText('Capture scope')).toHaveProperty('disabled', false);
    },
  );
  it.each([401, 403])(
    'hides cached values and history after a %s current read denial',
    async (status) => {
      const view = show();
      await expand();
      fireEvent.click(screen.getByRole('button', { name: 'Capture history and restore' }));
      await screen.findByText('Reason: Reviewed prior pause');
      mockedApi.mockRejectedValue(
        new ApiError(status, {
          code: 'FORBIDDEN',
          message: 'private detail',
          requestId: 'fixture',
        }),
      );
      await view.client.invalidateQueries({
        queryKey: scopedSettingsKeys.current(TEST_EVENT.id, session.personId, current.target),
      });
      await screen.findByRole('alert');
      expect(screen.queryByText(/Effective capture:/)).toBeNull();
      expect(screen.queryByText('Reason: Reviewed prior pause')).toBeNull();
    },
  );
  it('discards private cache on collapse, permission loss and sign-out', async () => {
    const view = show();
    await expand();
    fireEvent.click(screen.getByRole('button', { name: 'Capture controls' }));
    await waitFor(() =>
      expect(
        view.client.getQueryState(
          scopedSettingsKeys.current(TEST_EVENT.id, session.personId, current.target),
        ),
      ).toBeUndefined(),
    );
    view.rerender(<CaptureControlsPanel enabled={false} />);
    expect(screen.queryByRole('button', { name: 'Capture controls' })).toBeNull();
    session.personId = '';
    view.rerender(<CaptureControlsPanel enabled />);
    expect(screen.queryByRole('button', { name: 'Capture controls' })).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it('hides capture controls immediately when history reads deny the shared authority', async () => {
    mockedApi.mockImplementation(async (path) => {
      if (path.includes('/history?'))
        throw new ApiError(403, {
          code: 'FORBIDDEN',
          message: 'private detail',
          requestId: 'fixture',
        });
      return current;
    });
    show();
    await expand();
    fireEvent.click(screen.getByRole('button', { name: 'Capture history and restore' }));
    await screen.findByText('Capture settings access is unavailable. Reload your session.');
    expect(screen.queryByText(/Effective capture:/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review pause' })).toBeNull();
  });
  it('refreshes scoped reviews without invalidating unrelated event panels', async () => {
    const view = show();
    const unrelated = [TEST_EVENT.id, 'event-settings'];
    view.client.setQueryData(unrelated, { mode: 'preserved product rule' });
    await choosePause();
    confirm();
    submit();
    await screen.findByText('Capture change applied.');
    expect(view.client.getQueryState(unrelated)?.isInvalidated).toBe(false);
    expect(view.client.getQueryData(unrelated)).toEqual({ mode: 'preserved product rule' });
  });
  it.each(['person', 'event'])('discards a reviewed target when the %s changes', async (change) => {
    const view = show();
    await choosePause();
    confirm();
    mockedApi.mockImplementation(() => new Promise(() => {}));
    if (change === 'person') session.personId = 'another-manager';
    else session.eventId = 'another-event';
    view.rerender(<CaptureControlsPanel enabled />);
    expect(screen.queryByRole('group', { name: 'Review capture change' })).toBeNull();
    expect(screen.queryByText(/Effective capture:/)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Capture controls' }).getAttribute('aria-expanded'),
    ).toBe('false');
    expect(writes()).toHaveLength(0);
  });
  it('loads history only on request and restores an owned saved result as a new version', async () => {
    setting({ storedVersion: 2, source: { scope: 'event', version: 2 } });
    show();
    await expand();
    expect(mockedApi.mock.calls.some(([path]) => path.includes('/history?'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Capture history and restore' }));
    await screen.findByText('Reason: Reviewed prior pause');
    expect(screen.getByText('Before: Open')).toBeTruthy();
    expect(screen.getByText('After: Paused')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review capture version 1' }));
    expect(screen.getByText(/Historical capture: Paused/)).toBeTruthy();
    confirm();
    submit();
    await screen.findByText('Capture change applied.');
    expect(writes()[0]![0]).toBe(`${endpoint}/revert`);
    expect(writes()[0]![1]!.body).toMatchObject({
      historyId: 'history-1',
      key: 'capture.open',
      expectedVersion: 2,
    });
    expect(writes()[0]![1]!.body).not.toHaveProperty('value');
  });
  it('describes RESET as override removal, without fabricating an old inherited after value', async () => {
    historyRows = [
      historyRow({
        source: 'RESET',
        values: { available: true, operation: 'reset', before: false },
      }),
    ];
    setting({ storedVersion: 2, source: { scope: 'event', version: 2 } });
    show();
    await expand();
    fireEvent.click(screen.getByRole('button', { name: 'Capture history and restore' }));
    await screen.findByText('Version 1 · Override removed');
    expect(screen.queryByText(/After:/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review capture version 1' }));
    expect(screen.getByText(/uses current inheritance. Earlier inherited/)).toBeTruthy();
    confirm();
    submit();
    await screen.findByText('Capture change applied.');
    expect(writes()[0]![0]).toBe(`${endpoint}/revert`);
  });
  it('refuses a RESET restore when there is already no selected override', async () => {
    historyRows = [
      historyRow({
        source: 'RESET',
        values: { available: true, operation: 'reset', before: false },
      }),
    ];
    show();
    await expand();
    expect(screen.getByRole('button', { name: 'Review removing override' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Capture history and restore' }));
    await screen.findByText(/There is no override to remove/);
    expect(screen.getByRole('button', { name: 'Review capture version 1' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(writes()).toHaveLength(0);
  });
  it('withholds malformed historical values while retaining bounded attribution and reason', async () => {
    historyRows = [historyRow({ values: { available: false } })];
    show();
    await expand();
    fireEvent.click(screen.getByRole('button', { name: 'Capture history and restore' }));
    await screen.findByText('This historical capture value is unavailable.');
    expect(screen.queryByRole('button', { name: 'Review capture version 1' })).toBeNull();
    expect(screen.getByText('Reason: Reviewed prior pause')).toBeTruthy();
  });
  it('pages history with a bounded owned cursor and clears paging when scope changes', async () => {
    mockedApi.mockImplementation(async (path) => {
      if (!path.includes('/history?')) return current;
      return path.includes('cursor=')
        ? historyPage([historyRow({ id: 'older', version: 1 })])
        : historyPage([historyRow({ id: 'last / row', version: 2 })], 'last / row');
    });
    show();
    await expand();
    fireEvent.click(screen.getByRole('button', { name: 'Capture history and restore' }));
    await screen.findByRole('button', { name: 'Load more capture history' });
    fireEvent.click(screen.getByRole('button', { name: 'Load more capture history' }));
    await screen.findByRole('button', { name: 'Review capture version 1' });
    expect(mockedApi).toHaveBeenCalledWith(
      `${endpoint}/history?scope=event&key=capture.open&limit=20&cursor=last+%2F+row`,
      { cache: 'no-store' },
    );
    current = read({ scope: 'station', stationId: 'station' });
    fireEvent.change(screen.getByLabelText('Capture scope'), { target: { value: 'station' } });
    await screen.findByText('Effective capture: Open');
    expect(screen.queryByRole('button', { name: 'Review capture version 1' })).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Capture history and restore' })
        .getAttribute('aria-expanded'),
    ).toBe('false');
  });
  it('keeps archived history readable and refuses new capture reviews', async () => {
    current.eventStatus = 'ARCHIVED';
    show();
    await expand();
    expect(screen.getByText('Archived event settings are read only.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Review pause' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Capture history and restore' }));
    await screen.findByText('Reason: Reviewed prior pause');
    expect(screen.getByRole('button', { name: 'Review capture version 1' })).toHaveProperty(
      'disabled',
      true,
    );
  });
  it.each([
    { status: 409, code: 'IDEMPOTENCY_IN_PROGRESS' },
    { status: 429, code: 'RATE_LIMITED' },
    { status: 503, code: 'UNAVAILABLE' },
  ])('preserves one retry intent for $status/$code', async ({ status, code }) => {
    failure = new ApiError(status, { code, message: 'private detail', requestId: 'fixture' });
    show();
    await choosePause();
    confirm();
    submit();
    await screen.findByRole('button', { name: 'Retry same capture change' });
    const first = writes()[0]![1]!.body;
    failure = null;
    fireEvent.click(screen.getByRole('button', { name: 'Retry same capture change' }));
    await screen.findByText('Capture change applied.');
    expect(writes()[1]![1]!.body).toEqual(first);
    expect(screen.queryByText('private detail')).toBeNull();
  });
});

describe('strict scoped settings feature API', () => {
  const body: ScopedSettingsMutationRequest = {
    operation: 'set',
    target: { scope: 'event' },
    key: 'capture.open',
    value: false,
    expectedVersion: 0,
    reason: 'Reviewed pause',
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
  };
  it('encodes station and cursor identifiers through validated queries', async () => {
    current = read({ scope: 'station', stationId: 'space / station' });
    await getScopedSettingHistory(TEST_EVENT.id, {
      target: current.target,
      key: 'capture.open',
      cursor: 'space / cursor',
    });
    expect(mockedApi).toHaveBeenLastCalledWith(
      `${endpoint}/history?scope=station&key=capture.open&limit=20&stationId=space+%2F+station&cursor=space+%2F+cursor`,
      { cache: 'no-store' },
    );
  });
  it.each(['event', 'station'])(
    'rejects a valid read bound to a different %s',
    async (selection) => {
      const target: ScopedSettingsTarget = { scope: 'station', stationId: 'station' };
      current = read(target);
      if (selection === 'event') current.eventId = 'other-event';
      else current.target = { scope: 'station', stationId: 'other-station' };
      await expect(getScopedSettings(TEST_EVENT.id, target)).rejects.toThrow();
    },
  );
  it('rejects history for another generated key and arbitrary private fields', async () => {
    const foreign = {
      ...historyPage(),
      key: 'captureUndoWindowSeconds',
      data: [
        {
          ...historyRow(),
          key: 'captureUndoWindowSeconds',
          values: { available: true, operation: 'set', before: 10, after: 10 },
        },
      ],
    };
    mockedApi.mockResolvedValue(foreign);
    await expect(
      getScopedSettingHistory(TEST_EVENT.id, { target: current.target, key: 'capture.open' }),
    ).rejects.toThrow();
    mockedApi.mockResolvedValue({
      ...historyPage(),
      data: [{ ...historyRow(), actorId: 'private actor' }],
    });
    await expect(
      getScopedSettingHistory(TEST_EVENT.id, { target: current.target, key: 'capture.open' }),
    ).rejects.toThrow();
  });
  it('refuses malformed generated current values and forged write fields before sending', async () => {
    setting({ value: 'private malformed value' });
    await expect(getScopedSettings(TEST_EVENT.id, current.target)).rejects.toThrow();
    mockedApi.mockClear();
    await expect(changeScopedSetting(TEST_EVENT.id, { ...body, reason: '' })).rejects.toThrow();
    const forged = { ...body, actorId: 'private actor' };
    await expect(changeScopedSetting(TEST_EVENT.id, forged)).rejects.toThrow();
    expect(mockedApi).not.toHaveBeenCalled();
  });
  it.each(['operation', 'review'])(
    'refuses a valid successful mutation with mismatched %s',
    async (field) => {
      const result = response(body);
      if (!result.change) throw new Error('Mutation fixture required');
      if (field === 'operation') result.change.operation = 'reset';
      else {
        result.reviewedVersion = 1;
        result.change.version = 2;
      }
      mockedApi.mockResolvedValue(result);
      await expect(changeScopedSetting(TEST_EVENT.id, body)).rejects.toThrow();
    },
  );
  it('refuses a successful restore bound to another selected history', async () => {
    const request: ScopedSettingsRevertRequest = {
      target: current.target,
      key: 'capture.open',
      historyId: 'history-1',
      expectedVersion: 0,
      reason: 'Reviewed restore',
      idempotencyKey: body.idempotencyKey,
    };
    const result = response(request);
    if (!('revertedFrom' in result)) throw new Error('Restore fixture required');
    mockedApi.mockResolvedValue({
      ...result,
      revertedFrom: { ...result.revertedFrom, historyId: 'other-history' },
    });
    await expect(revertScopedSetting(TEST_EVENT.id, request)).rejects.toThrow();
  });
});
