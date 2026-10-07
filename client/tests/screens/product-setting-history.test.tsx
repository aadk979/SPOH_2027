import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SettingChangeSource,
  type EventSettingHistoryRecord,
  type EventSettingsResponse,
} from '@spoh/shared';
import { ProductHistoryPanel } from '@/features/settings/components/ProductHistoryPanel';
import { ProductRevertReview } from '@/features/settings/components/ProductRevertReview';
import {
  getEventSettingHistory,
  getReviewedEventSettings,
  revertEventSetting,
} from '@/features/settings/api';
import { productHistoryKeys } from '@/features/settings/queries';
import { productValueLabel, settingSourceLabels } from '@/features/settings/model/productHistory';
import { api } from '@/shared/lib/api';
import { ApiError, NetworkError } from '@/shared/lib/apiErrors';
import { TEST_EVENT } from '../helpers/event';

const session = vi.hoisted(() => ({ personId: 'setting-manager', eventId: 'evt_test' }));
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
const endpoint = `/events/${TEST_EVENT.id}/admin/event-settings`;
let current: EventSettingsResponse;
let failure: Error | null;
function row(overrides: Partial<EventSettingHistoryRecord> = {}): EventSettingHistoryRecord {
  return {
    id: 'history-1',
    eventId: TEST_EVENT.id,
    key: 'product.countsMode',
    version: 1,
    source: 'USER',
    createdAt: '2027-01-01T02:00:00Z',
    createdByYou: true,
    reason: 'Reviewed count rule',
    values: {
      available: true,
      before: { mode: 'separate' },
      after: { mode: 'headline', source: { count: 'registrations' } },
    },
    ...overrides,
  } as EventSettingHistoryRecord;
}
function page(rows = [row()], nextCursor: string | null = null) {
  return {
    eventId: TEST_EVENT.id,
    key: rows[0]?.key ?? 'product.countsMode',
    evaluatedAt: '2027-01-01T03:00:00Z',
    data: rows,
    meta: { count: rows.length, nextCursor },
  };
}
function show(component = <ProductHistoryPanel enabled />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return {
    client,
    ...render(component, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}
function writes() {
  return mockedApi.mock.calls.filter(([, options]) => options?.method === 'POST');
}
async function expand() {
  fireEvent.click(screen.getByRole('button', { name: 'Setting history and restore' }));
  await screen.findByText(/Checked event-clock/);
}
async function review() {
  await expand();
  fireEvent.click(screen.getByRole('button', { name: 'Review version 1' }));
}
function confirm(reason = 'Restore the reviewed synthetic value') {
  fireEvent.change(screen.getByLabelText('Reason for restoring'), { target: { value: reason } });
  fireEvent.click(screen.getByRole('checkbox'));
}
function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Restore this version' }));
}
function revertResponse(body: { historyId: string; expectedVersion: number }) {
  return {
    history: row({ id: 'new-history', source: 'REVERT', version: body.expectedVersion + 1 }),
    current: {
      ...current,
      versions: { ...current.versions, 'product.countsMode': body.expectedVersion + 1 },
    },
    reviewedVersion: body.expectedVersion,
    revertedFrom: { historyId: body.historyId, version: 1 },
  };
}
beforeEach(() => {
  session.personId = 'setting-manager';
  session.eventId = TEST_EVENT.id;
  failure = null;
  current = {
    settings: {
      'product.countsMode': { mode: 'separate' },
      'product.visitorDataMode': 'none',
      lostPersonPurgeHours: 24,
    },
    versions: { 'product.countsMode': 2, 'product.visitorDataMode': 0, lostPersonPurgeHours: 0 },
  };
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (path, options) => {
    if (options?.method === 'POST') {
      if (failure) throw failure;
      return revertResponse(options.body as { historyId: string; expectedVersion: number });
    }
    return path.includes('/history?') ? page() : current;
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe('guarded product setting history', () => {
  it('loads only after expansion and renders validated values, attribution, source and event time', async () => {
    show();
    expect(mockedApi).not.toHaveBeenCalled();
    await expand();
    expect(mockedApi).toHaveBeenCalledWith(`${endpoint}/history?key=product.countsMode&limit=20`, {
      cache: 'no-store',
    });
    expect(mockedApi).toHaveBeenCalledWith(endpoint, { cache: 'no-store' });
    expect(screen.getByText('Before: Three counts, side by side')).toBeTruthy();
    expect(screen.getByText('After: Headline from registrations')).toBeTruthy();
    expect(screen.getByText(/event-clock:2027-01-01T02:00:00Z · Changed by you/)).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });
  it.each(SettingChangeSource.options)(
    'labels the %s source without inventing attribution',
    async (source) => {
      mockedApi.mockImplementation(async (path) =>
        path.includes('/history?') ? page([row({ source, createdByYou: false })]) : current,
      );
      show();
      await expand();
      expect(screen.getByText(`Version 1 · ${settingSourceLabels[source]}`)).toBeTruthy();
      expect(screen.queryByText(/Changed by you/)).toBeNull();
    },
  );
  it('pages using bounded cursors and resets review/paging when changing keys', async () => {
    mockedApi.mockImplementation(async (path) => {
      if (!path.includes('/history?')) return current;
      if (path.includes('visitorDataMode'))
        return page([
          row({
            id: 'visitor-history',
            key: 'product.visitorDataMode',
            values: { available: true, before: 'allowlist', after: 'none' },
          }),
        ]);
      return path.includes('cursor=')
        ? page([row({ id: 'history-2', version: 2 })])
        : page([row()], 'history-1');
    });
    show();
    await expand();
    fireEvent.click(screen.getByRole('button', { name: 'Load more setting history' }));
    await screen.findByRole('button', { name: 'Review version 2' });
    expect(mockedApi).toHaveBeenCalledWith(
      `${endpoint}/history?key=product.countsMode&limit=20&cursor=history-1`,
      { cache: 'no-store' },
    );
    fireEvent.change(screen.getByLabelText('Setting history for'), {
      target: { value: 'product.visitorDataMode' },
    });
    await screen.findByText('After: No visitor personal data');
    expect(screen.queryByRole('button', { name: 'Review version 2' })).toBeNull();
  });
  it('does not offer an unavailable historical JSON value for restore', async () => {
    mockedApi.mockImplementation(async (path) =>
      path.includes('/history?') ? page([row({ values: { available: false } })]) : current,
    );
    show();
    await expand();
    expect(screen.getByText('This historical value is unavailable.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Review version/ })).toBeNull();
  });
  it('shows an empty history without a write action', async () => {
    mockedApi.mockImplementation(async (path) => (path.includes('/history?') ? page([]) : current));
    show();
    await expand();
    expect(screen.getByText('No history for this setting yet.')).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });
  it('requires a written reason and explicit confirmation of the current and historical values', async () => {
    show();
    await review();
    expect(screen.getByText('Current version 2: Three counts, side by side')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore this version' })).toHaveProperty(
      'disabled',
      true,
    );
    confirm('  Restore reviewed counts  ');
    submit();
    await screen.findByRole('status');
    expect(writes()).toHaveLength(1);
    expect(writes()[0]![1]!.body).toMatchObject({
      key: 'product.countsMode',
      historyId: 'history-1',
      expectedVersion: 2,
      reason: 'Restore reviewed counts',
    });
    expect(screen.getByRole('button', { name: 'Restore this version' })).toHaveProperty(
      'disabled',
      true,
    );
  });
  it('clears confirmation when the written reason changes', async () => {
    show();
    await review();
    confirm();
    fireEvent.change(screen.getByLabelText('Reason for restoring'), {
      target: { value: 'A revised reason' },
    });
    expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
    submit();
    expect(writes()).toHaveLength(0);
  });
  it('replays the exact reviewed request after a lost response even when current polling has advanced', async () => {
    failure = new NetworkError('synthetic loss');
    const view = show();
    await review();
    confirm();
    submit();
    await screen.findByRole('alert');
    const first = writes()[0]![1]!.body;
    current = { ...current, versions: { ...current.versions, 'product.countsMode': 3 } };
    await view.client.invalidateQueries({
      queryKey: productHistoryKeys.current(TEST_EVENT.id, session.personId),
    });
    expect(screen.getByRole('button', { name: 'Restore this version' })).toHaveProperty(
      'disabled',
      false,
    );
    failure = null;
    submit();
    await screen.findByRole('status');
    expect(writes()[1]![1]!.body).toEqual(first);
  });
  it('blocks a version conflict until a fresh review clears reason, confirmation and intent', async () => {
    failure = new ApiError(409, {
      code: 'SETTING_VERSION_CONFLICT',
      message: 'private detail',
      requestId: 'fixture',
    });
    show();
    await review();
    confirm();
    submit();
    await screen.findByText(/This setting changed after your review/);
    const first = writes()[0]![1]!.body;
    expect(screen.queryByText('private detail')).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore this version' })).toHaveProperty(
      'disabled',
      true,
    );
    current = { ...current, versions: { ...current.versions, 'product.countsMode': 4 } };
    fireEvent.click(screen.getByRole('button', { name: 'Review current values' }));
    await screen.findByText('Current version 4: Three counts, side by side');
    expect(screen.getByLabelText('Reason for restoring')).toHaveProperty('value', '');
    expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
    failure = null;
    confirm();
    submit();
    await screen.findByRole('status');
    expect(writes()[1]![1]!.body).toMatchObject({ expectedVersion: 4 });
    expect(writes()[1]![1]!.body).not.toEqual(first);
  });
  it.each([401, 403])(
    'hides the current/history values and controls after a %s write denial',
    async (status) => {
      failure = new ApiError(status, {
        code: 'FORBIDDEN',
        message: 'private detail',
        requestId: 'fixture',
      });
      show();
      await review();
      confirm();
      submit();
      await screen.findByRole('alert');
      expect(screen.queryByLabelText('Reason for restoring')).toBeNull();
      expect(screen.queryByText(/Current version 2:/)).toBeNull();
    },
  );
  it('hides cached history and review after a read denial', async () => {
    show();
    await review();
    mockedApi.mockRejectedValue(
      new ApiError(403, { code: 'FORBIDDEN', message: 'private detail', requestId: 'fixture' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload setting history' }));
    await screen.findByRole('alert');
    expect(screen.queryByLabelText('Reason for restoring')).toBeNull();
    expect(screen.queryByText(/Current version/)).toBeNull();
  });
  it('discards history on collapse and unmounts it on permission loss/sign-out', async () => {
    const view = show();
    await expand();
    fireEvent.click(screen.getByRole('button', { name: 'Setting history and restore' }));
    await waitFor(() =>
      expect(
        view.client.getQueryState(
          productHistoryKeys.list(TEST_EVENT.id, session.personId, 'product.countsMode'),
        ),
      ).toBeUndefined(),
    );
    view.rerender(<ProductHistoryPanel enabled={false} />);
    expect(screen.queryByRole('button', { name: 'Setting history and restore' })).toBeNull();
    session.personId = '';
    view.rerender(<ProductHistoryPanel enabled />);
    expect(mockedApi.mock.calls.every(([, options]) => options?.method !== 'POST')).toBe(true);
  });
  it('never shows the prior person’s history while a new person reads', async () => {
    const view = show();
    await expand();
    mockedApi.mockImplementation(() => new Promise(() => {}));
    session.personId = 'other-person';
    view.rerender(<ProductHistoryPanel enabled />);
    expect(screen.queryByText('Reason: Reviewed count rule')).toBeNull();
  });
  it('discards a reviewed target when switching to an event whose queries are already populated', async () => {
    const view = show();
    await review();
    const otherEvent = 'other-event';
    view.client.setQueryData(productHistoryKeys.current(otherEvent, session.personId), current);
    view.client.setQueryData(
      productHistoryKeys.list(otherEvent, session.personId, 'product.countsMode'),
      {
        pages: [
          {
            ...page(),
            eventId: otherEvent,
            data: [row({ id: 'other-history', eventId: otherEvent, reason: 'Other event reason' })],
          },
        ],
        pageParams: [undefined],
      },
    );
    mockedApi.mockImplementation(() => new Promise(() => {}));
    session.eventId = otherEvent;
    view.rerender(<ProductHistoryPanel enabled />);
    expect(screen.queryByRole('group', { name: 'Review setting restore' })).toBeNull();
    expect(screen.getByText('Reason: Other event reason')).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });
  it('explains irreversible privacy purge before restoring none', () => {
    show(
      <ProductRevertReview
        target={row({
          key: 'product.visitorDataMode',
          values: { available: true, before: 'allowlist', after: 'none' },
        })}
        current={current}
        stations={[]}
        loadCurrent={async () => current}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/permanently deletes any visitor personal records/)).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });
});

describe('strict product history feature API', () => {
  it('encodes cursors and rejects a valid response from a different event or key', async () => {
    await getEventSettingHistory(TEST_EVENT.id, {
      key: 'product.countsMode',
      cursor: 'space / cursor',
    });
    expect(mockedApi).toHaveBeenLastCalledWith(
      `${endpoint}/history?key=product.countsMode&limit=20&cursor=space+%2F+cursor`,
      { cache: 'no-store' },
    );
    mockedApi.mockResolvedValue({
      ...page(),
      eventId: 'foreign',
      data: [row({ eventId: 'foreign' })],
    });
    await expect(
      getEventSettingHistory(TEST_EVENT.id, { key: 'product.countsMode' }),
    ).rejects.toThrow();
  });
  it('rejects arbitrary historical fields and malformed current values', async () => {
    mockedApi.mockResolvedValue({ ...page(), data: [{ ...row(), payload: 'private' }] });
    await expect(
      getEventSettingHistory(TEST_EVENT.id, { key: 'product.countsMode' }),
    ).rejects.toThrow();
    mockedApi.mockResolvedValue({
      ...current,
      settings: { ...current.settings, 'product.countsMode': { mode: 'sum' } },
    });
    await expect(getReviewedEventSettings(TEST_EVENT.id)).rejects.toThrow();
  });
  it('rejects invalid requests before sending and refuses a mismatched successful revert', async () => {
    const body = {
      key: 'product.countsMode' as const,
      historyId: 'history-1',
      expectedVersion: 2,
      reason: 'Restore reviewed rule',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    };
    await expect(revertEventSetting(TEST_EVENT.id, { ...body, reason: '' })).rejects.toThrow();
    expect(writes()).toHaveLength(0);
    mockedApi.mockResolvedValue({
      ...revertResponse(body),
      revertedFrom: { historyId: 'other', version: 1 },
    });
    await expect(revertEventSetting(TEST_EVENT.id, body)).rejects.toThrow();
  });
  it('formats known headline stations and omits raw missing-station identifiers', () => {
    expect(
      productValueLabel({ mode: 'headline', source: { count: 'footfall', stationId: 'station' } }, [
        { id: 'station', name: 'Entry station' },
      ]),
    ).toBe('Headline from entries at Entry station');
    expect(
      productValueLabel({
        mode: 'headline',
        source: { count: 'footfall', stationId: 'private-id' },
      }),
    ).toBe('Headline from an unavailable station');
  });
});
