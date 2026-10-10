import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  CaptureScheduleRecord,
  ScopedSettingsReadResponse,
  CreateCaptureScheduleRequest,
  UpdateCaptureScheduleRequest,
  CancelCaptureScheduleRequest,
} from '@spoh/shared';
import { CaptureControlsPanel } from '@/features/settings/components/CaptureControlsPanel';
import { api } from '@/shared/lib/api';
import { ApiError } from '@/shared/lib/apiErrors';
import { captureCurrent, captureSchedule } from '../helpers/captureSchedule';
import { permissionsFor } from '../helpers/permissions';
import { TEST_EVENT } from '../helpers/event';

const identity = vi.hoisted(() => ({
  personId: 'manager',
  eventId: 'evt_test',
  timezone: 'Asia/Singapore',
  allowed: true,
}));
vi.mock('@/shared/lib/eventContext', async (original) => ({
  ...(await original<typeof import('@/shared/lib/eventContext')>()),
  useEventId: () => identity.eventId,
}));
vi.mock('@/features/session', async (original) => ({
  ...(await original<typeof import('@/features/session')>()),
  ...(await import('../helpers/permissions')).permissionHooks(() =>
    permissionsFor(identity.allowed ? ['Schedule.Manage'] : []),
  ),
  useCurrentSession: () => ({ volunteerId: identity.personId }),
  useMe: () => ({
    data: {
      volunteer: { id: identity.personId },
      event: { id: identity.eventId, timezone: identity.timezone },
    },
  }),
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
let current: ScopedSettingsReadResponse;
let rows: CaptureScheduleRecord[];
let cursor: string | null;
let failure: Error | null;
let lostOnce: boolean;
const endpoint = `/events/${TEST_EVENT.id}/admin/settings/catalogue`;
function page() {
  return {
    eventId: current.eventId,
    target: current.target,
    key: 'capture.open',
    evaluatedAt: current.evaluatedAt,
    data: rows,
    meta: { count: rows.length, nextCursor: cursor },
  };
}
function writeResult(
  method: string,
  path: string,
  body: CreateCaptureScheduleRequest | UpdateCaptureScheduleRequest | CancelCaptureScheduleRequest,
) {
  if (path.endsWith('/cancel'))
    rows = rows.map((row) => ({
      ...row,
      status: 'CANCELLED',
      version: 3,
      completedAt: '2027-01-01T03:01:00Z',
    }));
  else if (method === 'PATCH' && 'runAt' in body)
    rows = rows.map((row) => ({
      ...row,
      value: body.value,
      expectedVersion: body.expectedVersion,
      reason: body.reason,
      version: 2,
      runAt: body.runAt,
      scheduledFor: body.runAt,
    }));
  else if (!rows.length && 'runAt' in body)
    rows = [
      captureSchedule(current, {
        value: body.value,
        expectedVersion: body.expectedVersion,
        reason: body.reason,
        runAt: body.runAt,
        scheduledFor: body.runAt,
      }),
    ];
  return { schedule: rows[0], current };
}
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData([TEST_EVENT.id, 'private-announcements'], { preserved: true });
  clients.push(client);
  return {
    client,
    ...render(<CaptureControlsPanel enabled />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}
async function expand() {
  fireEvent.click(screen.getByRole('button', { name: 'Capture controls' }));
  await screen.findByText('Effective capture: Open');
  fireEvent.click(screen.getByRole('button', { name: 'Capture schedules' }));
  await screen.findByRole('button', { name: 'Review future capture change' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Reload capture schedules' })).toHaveProperty(
      'disabled',
      false,
    ),
  );
}
async function createReview() {
  await expand();
  fireEvent.click(screen.getByRole('button', { name: 'Review future capture change' }));
}
function confirm() {
  fireEvent.change(screen.getByLabelText('Reason for capture schedule'), {
    target: { value: 'Reviewed future capture action' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
}
function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Confirm capture schedule' }));
}
function writes() {
  return mockedApi.mock.calls.filter(([, options]) =>
    ['POST', 'PATCH'].includes(options?.method ?? ''),
  );
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2027-01-01T03:00:00Z');
  identity.personId = 'manager';
  identity.eventId = TEST_EVENT.id;
  identity.timezone = TEST_EVENT.timezone;
  identity.allowed = true;
  current = captureCurrent();
  rows = [];
  cursor = null;
  failure = null;
  lostOnce = false;
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (path, options) => {
    if (['POST', 'PATCH'].includes(options?.method ?? '')) {
      if (failure) throw failure;
      const result = writeResult(
        options!.method!,
        path,
        options!.body as CreateCaptureScheduleRequest,
      );
      if (lostOnce) {
        lostOnce = false;
        throw new Error('lost committed response');
      }
      return result;
    }
    if (path.includes('/schedules?')) return page();
    if (path.includes('/schedules/')) return { schedule: rows[0], current };
    if (path.includes('/history?'))
      return { ...current, key: 'capture.open', data: [], meta: { count: 0, nextCursor: null } };
    return current;
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
});

it('reads schedules only after explicit navigation and uses the event timezone', async () => {
  show();
  expect(mockedApi).not.toHaveBeenCalled();
  await createReview();
  expect(mockedApi).toHaveBeenCalledWith(
    `${endpoint}/schedules?scope=event&key=capture.open&limit=20`,
    { cache: 'no-store' },
  );
  expect(screen.getByLabelText('Change capture at (Asia/Singapore)')).toHaveProperty(
    'value',
    '2027-01-01T11:05',
  );
  expect(screen.getByRole('button', { name: 'Confirm capture schedule' })).toHaveProperty(
    'disabled',
    true,
  );
  confirm();
  submit();
  await screen.findByText(/Schedule request confirmed/);
  expect(writes()).toHaveLength(1);
  expect(writes()[0]?.[1]?.body).toMatchObject({
    target: { scope: 'event' },
    key: 'capture.open',
    value: false,
    expectedVersion: 0,
    runAt: '2027-01-01T03:05:00.000Z',
  });
});
it('freezes a lost committed request, scope, collapse and form; retry reuses the exact body', async () => {
  const view = show();
  lostOnce = true;
  await createReview();
  confirm();
  submit();
  await screen.findByRole('button', { name: 'Retry same schedule request' });
  expect(screen.getByLabelText('Capture scope')).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'Capture controls' })).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'Back to capture schedules' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(screen.getByLabelText('Reason for capture schedule').closest('fieldset')).toHaveProperty(
    'disabled',
    true,
  );
  rows[0] = {
    ...rows[0]!,
    value: true,
    version: 3,
    status: 'CANCELLED',
    completedAt: '2027-01-01T03:01:00Z',
  };
  fireEvent.click(screen.getByRole('button', { name: 'Retry same schedule request' }));
  await screen.findByText(/Current status: Cancelled · Version 3/);
  expect(writes()).toHaveLength(2);
  expect(writes()[1]?.[1]?.body).toEqual(writes()[0]?.[1]?.body);
  expect(view.client.getQueryState([TEST_EVENT.id, 'private-announcements'])?.isInvalidated).toBe(
    false,
  );
});
it('reviews separate edit versions and lets a manager cancel another creator', async () => {
  rows = [captureSchedule(current, { version: 7 })];
  show();
  await expand();
  fireEvent.click(screen.getByRole('button', { name: 'Edit capture schedule' }));
  confirm();
  submit();
  await screen.findByText(/Schedule request confirmed/);
  expect(writes()[0]?.[1]).toMatchObject({
    method: 'PATCH',
    body: { expectedScheduleVersion: 7, expectedVersion: 0 },
  });
  expect(writes()[0]?.[1]?.body).not.toHaveProperty('target');
  fireEvent.click(screen.getByRole('button', { name: 'Back to capture schedules' }));
  rows = [{ ...rows[0]!, createdByYou: false }];
  fireEvent.click(screen.getByRole('button', { name: 'Reload capture schedules' }));
  await screen.findByText(/Scheduled by another manager/);
  expect(screen.queryByRole('button', { name: 'Edit capture schedule' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel capture schedule' }));
  confirm();
  submit();
  await screen.findByText(/Current status: Cancelled/);
  expect(writes()[1]?.[1]?.body).toMatchObject({ expectedScheduleVersion: 2 });
  expect(writes()[1]?.[1]?.body).not.toHaveProperty('expectedVersion');
});
it('clears private scoped data and hides the review after denied writes', async () => {
  const view = show();
  failure = new ApiError(403, { code: 'FORBIDDEN', message: 'private detail', requestId: 'test' });
  await createReview();
  confirm();
  submit();
  await screen.findByText('Capture settings access is unavailable. Reload your session.');
  expect(screen.queryByLabelText('Reason for capture schedule')).toBeNull();
  expect(
    view.client.getQueryCache().findAll({
      predicate: (query) =>
        ['capture-schedules', 'scoped-settings'].includes(String(query.queryKey[1])) &&
        query.state.data !== undefined,
    }),
  ).toHaveLength(0);
});
it('keeps archived schedules readable and all pending controls disabled', async () => {
  current.eventStatus = 'ARCHIVED';
  rows = [captureSchedule(current)];
  show();
  await expand();
  expect(screen.getByRole('button', { name: 'Edit capture schedule' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(screen.getByRole('button', { name: 'Cancel capture schedule' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(screen.getByRole('button', { name: 'Review future capture change' })).toHaveProperty(
    'disabled',
    true,
  );
});
it('follows an empty raw page cursor before enabling creation', async () => {
  cursor = 'next';
  show();
  await expand();
  expect(screen.getByRole('button', { name: 'Review future capture change' })).toHaveProperty(
    'disabled',
    true,
  );
  cursor = null;
  rows = [captureSchedule(current)];
  fireEvent.click(screen.getByRole('button', { name: 'Load more capture schedules' }));
  await screen.findByRole('button', { name: 'Edit capture schedule' });
  expect(mockedApi.mock.calls.some(([path]) => path.endsWith('&cursor=next'))).toBe(true);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Review future capture change' })).toHaveProperty(
      'disabled',
      false,
    ),
  );
});

it('makes a station parent change stale without confusing inherited and stored versions', async () => {
  const view = show();
  fireEvent.click(screen.getByRole('button', { name: 'Capture controls' }));
  await screen.findByText('Effective capture: Open');
  current = captureCurrent({ scope: 'station', stationId: 'station' });
  current.data.find((row) => row.key === 'capture.open')!.source = { scope: 'event', version: 9 };
  fireEvent.change(screen.getByLabelText('Capture scope'), { target: { value: 'station' } });
  await screen.findByText('Inherited from event settings');
  fireEvent.click(screen.getByRole('button', { name: 'Capture schedules' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Review future capture change' })).toHaveProperty(
      'disabled',
      false,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Review future capture change' }));
  confirm();
  current = structuredClone(current);
  current.data.find((row) => row.key === 'capture.open')!.source.version = 10;
  await view.client.invalidateQueries({
    predicate: (query) => query.queryKey[1] === 'scoped-settings',
  });
  await screen.findByText('Schedule or capture settings changed after your review.');
  expect(screen.getByRole('button', { name: 'Confirm capture schedule' })).toHaveProperty(
    'disabled',
    true,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Review current schedule and capture values' }),
  );
  await waitFor(() =>
    expect(
      screen.queryByText('Schedule or capture settings changed after your review.'),
    ).toBeNull(),
  );
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
  confirm();
  submit();
  await screen.findByText(/Schedule request confirmed/);
  expect(writes()[0]?.[1]?.body).toMatchObject({
    target: { scope: 'station', stationId: 'station' },
    expectedVersion: 0,
  });
});
it('reloads a changed schedule definition and requires a fresh independent review', async () => {
  const view = show();
  rows = [captureSchedule(current)];
  await expand();
  fireEvent.click(screen.getByRole('button', { name: 'Edit capture schedule' }));
  confirm();
  rows = [{ ...rows[0]!, version: 5, value: true }];
  await view.client.invalidateQueries({
    predicate: (query) => query.queryKey[1] === 'capture-schedules',
  });
  await screen.findByText('Schedule or capture settings changed after your review.');
  fireEvent.click(
    screen.getByRole('button', { name: 'Review current schedule and capture values' }),
  );
  await screen.findByText('Reviewed schedule version 5 · Pending');
  await waitFor(() =>
    expect(
      screen.queryByText('Schedule or capture settings changed after your review.'),
    ).toBeNull(),
  );
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
  confirm();
  submit();
  await screen.findByText(/Schedule request confirmed/);
  expect(writes()[0]?.[1]?.body).toMatchObject({
    expectedScheduleVersion: 5,
    value: true,
    expectedVersion: 0,
  });
});
it('refuses editing once a worker has claimed the reviewed action', async () => {
  const view = show();
  rows = [captureSchedule(current)];
  await expand();
  fireEvent.click(screen.getByRole('button', { name: 'Edit capture schedule' }));
  confirm();
  rows = [{ ...rows[0]!, status: 'RUNNING', version: 2 }];
  await view.client.invalidateQueries({
    predicate: (query) => query.queryKey[1] === 'capture-schedules',
  });
  await screen.findByText('Schedule or capture settings changed after your review.');
  fireEvent.click(
    screen.getByRole('button', { name: 'Review current schedule and capture values' }),
  );
  await screen.findByText('Reviewed schedule version 2 · Running');
  expect(screen.getByRole('button', { name: 'Confirm capture schedule' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(writes()).toHaveLength(0);
});
it.each([429, 503])('freezes HTTP %s without generating another intent', async (status) => {
  show();
  failure = new ApiError(status, {
    code: 'INTERNAL_ERROR',
    message: 'private raw detail',
    requestId: 'test',
  });
  await createReview();
  confirm();
  submit();
  await screen.findByRole('button', { name: 'Retry same schedule request' });
  expect(screen.getByRole('button', { name: 'Capture controls' })).toHaveProperty('disabled', true);
  failure = null;
  fireEvent.click(screen.getByRole('button', { name: 'Retry same schedule request' }));
  await screen.findByText(/Schedule request confirmed/);
  expect(writes()[1]?.[1]?.body).toEqual(writes()[0]?.[1]?.body);
  expect(screen.queryByText('private raw detail')).toBeNull();
});
it('hides cached schedule content after denied collection reads', async () => {
  const view = show();
  rows = [captureSchedule(current, { reason: 'Private schedule detail' })];
  await expand();
  await screen.findByText('Reason: Private schedule detail');
  mockedApi.mockRejectedValue(
    new ApiError(403, { code: 'FORBIDDEN', message: 'private raw detail', requestId: 'test' }),
  );
  await view.client.invalidateQueries({
    predicate: (query) => query.queryKey[1] === 'capture-schedules',
  });
  await screen.findByText('Capture settings access is unavailable. Reload your session.');
  expect(screen.queryByText('Reason: Private schedule detail')).toBeNull();
});
it.each(['clock', 'capability'])(
  'refuses scheduling when current %s is unavailable',
  async (missing) => {
    show();
    if (missing === 'clock') identity.timezone = '';
    else identity.allowed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Capture controls' }));
    await screen.findByText('Effective capture: Open');
    fireEvent.click(screen.getByRole('button', { name: 'Capture schedules' }));
    await screen.findByRole('alert');
    expect(screen.queryByLabelText('Reason for capture schedule')).toBeNull();
    expect(mockedApi.mock.calls.some(([path]) => path.includes('/schedules'))).toBe(false);
  },
);
it('requires a future date and invalidates confirmation when a field changes', async () => {
  show();
  await createReview();
  confirm();
  fireEvent.change(screen.getByLabelText('Change capture at (Asia/Singapore)'), {
    target: { value: '2027-01-01T10:00' },
  });
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
  fireEvent.click(screen.getByRole('checkbox'));
  submit();
  await screen.findByText('Choose a valid future date and time on the event clock.');
  expect(writes()).toHaveLength(0);
});
it.each(['person', 'event'])(
  'does not expose an old review after a %s transition',
  async (kind) => {
    const view = show();
    await createReview();
    confirm();
    if (kind === 'person') identity.personId = 'other-manager';
    else {
      identity.eventId = 'other-event';
      current = { ...current, eventId: identity.eventId };
    }
    view.rerender(<CaptureControlsPanel enabled />);
    expect(screen.queryByLabelText('Reason for capture schedule')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Capture controls' }).getAttribute('aria-expanded'),
    ).toBe('false');
    expect(writes()).toHaveLength(0);
  },
);
it('clears the review after denied current-action reload', async () => {
  const view = show();
  rows = [captureSchedule(current)];
  await expand();
  fireEvent.click(screen.getByRole('button', { name: 'Edit capture schedule' }));
  rows = [{ ...rows[0]!, version: 2 }];
  await view.client.invalidateQueries({
    predicate: (query) => query.queryKey[1] === 'capture-schedules',
  });
  await screen.findByText('Schedule or capture settings changed after your review.');
  mockedApi.mockRejectedValue(
    new ApiError(403, { code: 'FORBIDDEN', message: 'private', requestId: 'test' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Review current schedule and capture values' }),
  );
  await screen.findByText('Capture settings access is unavailable. Reload your session.');
  expect(screen.queryByLabelText('Reason for capture schedule')).toBeNull();
});
it('does not reinterpret a confirmed review after the event timezone changes', async () => {
  const view = show();
  await createReview();
  confirm();
  identity.timezone = 'Europe/London';
  view.rerender(<CaptureControlsPanel enabled />);
  await screen.findByText('Schedule or capture settings changed after your review.');
  expect(screen.getByRole('button', { name: 'Confirm capture schedule' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(screen.getByLabelText('Change capture at (Asia/Singapore)')).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: 'Review current schedule and capture values' }),
  );
  await screen.findByLabelText('Change capture at (Europe/London)');
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
});
