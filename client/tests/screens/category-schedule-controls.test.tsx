import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  CategoryActivityResponse,
  CategoryScheduleRecord,
  CreateCategoryScheduleRequest,
  UpdateCategoryScheduleRequest,
  CancelCategoryScheduleRequest,
} from '@spoh/shared';
import { CategorySchedulesPanel } from '@/features/taxonomy';
import { categoryKeys } from '@/features/taxonomy/queries';
import { api } from '@/shared/lib/api';
import { ApiError } from '@/shared/lib/apiErrors';

const identity = vi.hoisted(() => ({
  personId: 'manager',
  mePersonId: 'manager',
  eventId: 'event',
  meEventId: 'event',
  timezone: 'Asia/Singapore',
  allowed: true,
  meError: null as Error | null,
}));
vi.mock('@/shared/lib/eventContext', async (original) => ({
  ...(await original<typeof import('@/shared/lib/eventContext')>()),
  useEventId: () => identity.eventId,
}));
vi.mock('@/features/session', async (original) => ({
  ...(await original<typeof import('@/features/session')>()),
  useCurrentSession: () => ({ volunteerId: identity.personId }),
  useMe: () => ({
    error: identity.meError,
    isError: !!identity.meError,
    data: {
      volunteer: { id: identity.mePersonId },
      event: { id: identity.meEventId, timezone: identity.timezone },
      capabilities: identity.allowed ? ['config.manage'] : [],
    },
  }),
  useEventTime: () => ({ dateTime: (value: string) => `event-clock:${value}` }),
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const clients: QueryClient[] = [];
let current: CategoryActivityResponse;
let rows: CategoryScheduleRecord[];
let categoryMore: boolean;
let scheduleMore: boolean;
let failure: Error | null;
let lostOnce: boolean;
type Body =
  CreateCategoryScheduleRequest | UpdateCategoryScheduleRequest | CancelCategoryScheduleRequest;
const base = '/events/event/admin/capture-categories';
function fixture(overrides: Partial<CategoryScheduleRecord> = {}): CategoryScheduleRecord {
  return {
    id: 'action',
    eventId: current.eventId,
    categoryId: current.data.id,
    kind: 'CAPTURE_CATEGORY',
    recurring: false,
    active: false,
    expectedActive: true,
    expectedUpdatedAt: current.data.updatedAt,
    reason: 'Reviewed category deactivation',
    status: 'PENDING',
    version: 1,
    attempts: 0,
    maxAttempts: 5,
    createdByYou: true,
    createdAt: current.evaluatedAt,
    scheduledFor: '2027-01-01T05:00:00Z',
    runAt: '2027-01-01T05:00:00Z',
    completedAt: null,
    lastError: null,
    ...overrides,
  };
}
function schedulePage(path: string) {
  const params = new URL(`http://localhost${path}`).searchParams;
  const selected = rows.filter(
    (row) => !params.get('status') || row.status === params.get('status'),
  );
  return {
    eventId: current.eventId,
    categoryId: current.data.id,
    evaluatedAt: current.evaluatedAt,
    data: scheduleMore && !params.has('cursor') ? [] : selected,
    meta: {
      count: scheduleMore && !params.has('cursor') ? 0 : selected.length,
      nextCursor: scheduleMore && !params.has('cursor') ? 'more-schedules' : null,
    },
  };
}
function writeResult(path: string, method: string, body: Body) {
  if (path.endsWith('/cancel'))
    rows = rows.map((row) => ({ ...row, status: 'CANCELLED', version: row.version + 1 }));
  else if ('runAt' in body) {
    const saved = {
      active: body.active,
      expectedActive: body.expectedActive,
      expectedUpdatedAt: body.expectedUpdatedAt,
      scheduledFor: body.runAt,
      runAt: body.runAt,
      reason: body.reason,
    };
    rows =
      method === 'PATCH'
        ? rows.map((row) => ({ ...row, ...saved, version: row.version + 1 }))
        : rows.length
          ? rows
          : [fixture(saved)];
  }
  return { schedule: rows[0], current };
}
function readResult(path: string) {
  if (path.startsWith(`${base}?`)) {
    const next = path.includes('cursor=');
    const categories = next
      ? [
          {
            ...current.data,
            id: 'inactive',
            code: 'INACTIVE',
            label: 'Inactive category',
            active: false,
          },
        ]
      : [current.data];
    return {
      eventId: current.eventId,
      eventStatus: current.eventStatus,
      evaluatedAt: current.evaluatedAt,
      data: categories,
      meta: {
        count: categories.length,
        nextCursor: categoryMore && !next ? 'more-categories' : null,
      },
    };
  }
  if (path.includes('/schedules?')) return schedulePage(path);
  if (path.includes('/schedules/')) return { schedule: rows[0], current };
  return current;
}
function show(enabled = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(['unrelated-private-feature'], { preserved: true });
  clients.push(client);
  return {
    client,
    ...render(<CategorySchedulesPanel enabled={enabled} />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}
async function expand() {
  fireEvent.click(screen.getByRole('button', { name: 'Category schedules' }));
  const picker = await screen.findByLabelText('Capture category');
  await waitFor(() => expect(picker).toHaveProperty('disabled', false));
  fireEvent.change(picker, { target: { value: 'category' } });
  await screen.findByRole('button', { name: 'Review future category change' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Reload category schedules' })).toHaveProperty(
      'disabled',
      false,
    ),
  );
}
async function createReview() {
  await expand();
  fireEvent.click(screen.getByRole('button', { name: 'Review future category change' }));
}
function confirm() {
  fireEvent.change(screen.getByLabelText('Reason for category schedule'), {
    target: { value: 'Reviewed future category action' },
  });
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I have reviewed the current category, schedule and effects',
    }),
  );
}
function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Confirm category schedule' }));
}
function writes() {
  return mockedApi.mock.calls.filter(([, options]) =>
    ['POST', 'PATCH'].includes(options?.method ?? ''),
  );
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2027-01-01T03:00:00Z');
  Object.assign(identity, {
    personId: 'manager',
    mePersonId: 'manager',
    eventId: 'event',
    meEventId: 'event',
    timezone: 'Asia/Singapore',
    allowed: true,
    meError: null,
  });
  current = {
    eventId: 'event',
    eventStatus: 'LIVE',
    evaluatedAt: '2027-01-01T03:00:00Z',
    data: {
      id: 'category',
      code: 'CRAFT',
      label: 'Craft category',
      sortOrder: 1,
      active: true,
      updatedAt: '2027-01-01T02:00:00Z',
    },
  };
  rows = [];
  categoryMore = false;
  scheduleMore = false;
  failure = null;
  lostOnce = false;
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (path, options) => {
    if (failure) throw failure;
    if (['POST', 'PATCH'].includes(options?.method ?? '')) {
      const response = writeResult(path, options!.method!, options!.body as Body);
      if (lostOnce) {
        lostOnce = false;
        throw new Error('response lost after commit');
      }
      return response;
    }
    return readResult(path);
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
});

it('requires an explicit reviewed future state on the current event clock before creating', async () => {
  show();
  await createReview();
  expect(screen.getByText(/absolute category state/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Confirm category schedule' })).toHaveProperty(
    'disabled',
    true,
  );
  confirm();
  submit();
  await screen.findByText(/Category schedule request confirmed/);
  expect(writes()).toHaveLength(1);
  expect(writes()[0]?.[1]?.body).toMatchObject({
    active: false,
    expectedActive: true,
    expectedUpdatedAt: '2027-01-01T02:00:00.000Z',
    runAt: '2027-01-01T03:05:00.000Z',
    reason: 'Reviewed future category action',
  });
  expect(writes()[0]?.[1]?.body).not.toHaveProperty('expectedVersion');
});
it('retains the identical body/key after a response is lost, and locks scope/fields/navigation', async () => {
  show();
  await createReview();
  confirm();
  lostOnce = true;
  submit();
  const retry = await screen.findByRole('button', { name: 'Retry same category schedule request' });
  expect(screen.getByLabelText('Capture category')).toHaveProperty('disabled', true);
  expect(screen.getByLabelText('Reason for category schedule').closest('fieldset')).toHaveProperty(
    'disabled',
    true,
  );
  expect(screen.getByRole('button', { name: 'Back to category schedules' })).toHaveProperty(
    'disabled',
    true,
  );
  identity.timezone = 'UTC';
  current = {
    ...current,
    data: { ...current.data, active: false, updatedAt: '2027-01-01T03:01:00Z' },
  };
  fireEvent.click(retry);
  await screen.findByText(/Category schedule request confirmed/);
  expect(writes()).toHaveLength(2);
  expect(writes()[1]?.[1]?.body).toEqual(writes()[0]?.[1]?.body);
  expect(rows).toHaveLength(1);
});
it('requires a fresh category snapshot after active/timestamp changes', async () => {
  const view = show();
  await createReview();
  confirm();
  current = {
    ...current,
    data: { ...current.data, active: false, updatedAt: '2027-01-01T03:01:00Z' },
  };
  act(() =>
    view.client.setQueryData(
      [...categoryKeys.owner('event', 'manager'), 'category', 'current'],
      current,
    ),
  );
  expect(
    await screen.findByText('Category, schedule or event clock changed after your review.'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Confirm category schedule' })).toHaveProperty(
    'disabled',
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Review current category and schedule' }));
  await waitFor(() =>
    expect(
      screen.queryByText('Category, schedule or event clock changed after your review.'),
    ).toBeNull(),
  );
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
  confirm();
  submit();
  await screen.findByText(/Category schedule request confirmed/);
  expect(writes()[0]?.[1]?.body).toMatchObject({
    active: true,
    expectedActive: false,
    expectedUpdatedAt: '2027-01-01T03:01:00.000Z',
  });
});
it('loads inactive category pages before choosing, and every schedule page before creating', async () => {
  categoryMore = true;
  scheduleMore = true;
  rows = [fixture({ status: 'DEAD', createdByYou: false })];
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Category schedules' }));
  expect(await screen.findByLabelText('Capture category')).toHaveProperty('disabled', true);
  fireEvent.click(await screen.findByRole('button', { name: 'Load more capture categories' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Capture category')).toHaveProperty('disabled', false),
  );
  expect(
    screen.getByRole('option', { name: /INACTIVE.*Inactive category.*Inactive/ }),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Capture category'), { target: { value: 'category' } });
  expect(
    await screen.findByRole('button', { name: 'Review future category change' }),
  ).toHaveProperty('disabled', true);
  fireEvent.click(await screen.findByRole('button', { name: 'Load more category schedules' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Review future category change' })).toHaveProperty(
      'disabled',
      false,
    ),
  );
  expect(
    within(screen.getByRole('list', { name: 'Category schedule results' })).getByText(
      /Stopped after failed attempts/,
    ),
  ).toBeTruthy();
});
it('shows every terminal state and prevents creation from a filtered subset', async () => {
  rows = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'DEAD'].map((status, index) =>
    fixture({
      id: `action-${index}`,
      status: status as CategoryScheduleRecord['status'],
      createdByYou: false,
    }),
  );
  show();
  await expand();
  expect(screen.getAllByRole('group', { name: 'Inactive category schedule' })).toHaveLength(6);
  fireEvent.change(screen.getByLabelText('Category schedule status'), {
    target: { value: 'FAILED' },
  });
  await waitFor(() =>
    expect(screen.getAllByRole('group', { name: 'Inactive category schedule' })).toHaveLength(1),
  );
  expect(screen.getByRole('button', { name: 'Review future category change' })).toHaveProperty(
    'disabled',
    true,
  );
});
it('offers creator-only pending edits but allows a manager to cancel another creator action', async () => {
  rows = [fixture({ createdByYou: false })];
  show();
  await expand();
  expect(screen.queryByRole('button', { name: 'Edit category schedule' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel category schedule' }));
  expect(screen.queryByLabelText('Change category at (Asia/Singapore)')).toBeNull();
  confirm();
  submit();
  await screen.findByText(/Category schedule request confirmed/);
  expect(writes()[0]?.[0]).toBe(`${base}/category/schedules/action/cancel`);
  expect(writes()[0]?.[1]?.body).toMatchObject({
    expectedScheduleVersion: 1,
    reason: 'Reviewed future category action',
  });
  expect(writes()[0]?.[1]?.body).not.toHaveProperty('expectedUpdatedAt');
});
it('edits the pending creator action with its reviewed schedule version and snapshot', async () => {
  rows = [fixture()];
  show();
  await expand();
  fireEvent.click(screen.getByRole('button', { name: 'Edit category schedule' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Active' }));
  confirm();
  submit();
  await screen.findByText(/Category schedule request confirmed/);
  expect(writes()[0]?.[1]).toMatchObject({
    method: 'PATCH',
    body: { active: true, expectedScheduleVersion: 1, expectedActive: true },
  });
});
it('keeps archived records readable while disabling create/edit/cancel', async () => {
  current = { ...current, eventStatus: 'ARCHIVED' };
  rows = [fixture()];
  show();
  await expand();
  for (const label of [
    'Review future category change',
    'Edit category schedule',
    'Cancel category schedule',
  ])
    expect(screen.getByRole('button', { name: label })).toHaveProperty('disabled', true);
  expect(writes()).toHaveLength(0);
});
it.each(['capability', 'event', 'person'])(
  'does not load private data with a mismatched current %s identity',
  async (mismatch) => {
    if (mismatch === 'capability') identity.allowed = false;
    if (mismatch === 'event') identity.meEventId = 'foreign';
    if (mismatch === 'person') identity.mePersonId = 'foreign';
    show();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(mockedApi).not.toHaveBeenCalled();
  },
);
it('purges only this private owner cache on access loss and hides private rows', async () => {
  rows = [fixture()];
  const view = show();
  await expand();
  failure = new ApiError(403, { code: 'FORBIDDEN', message: 'access lost', requestId: 'test' });
  fireEvent.click(screen.getByRole('button', { name: 'Reload category schedules' }));
  await waitFor(() =>
    expect(screen.queryByRole('list', { name: 'Category schedule results' })).toBeNull(),
  );
  await waitFor(() =>
    expect(
      view.client.getQueryCache().findAll({ queryKey: categoryKeys.owner('event', 'manager') }),
    ).toHaveLength(0),
  );
  expect(view.client.getQueryData(['unrelated-private-feature'])).toEqual({ preserved: true });
});
it('refuses writes after non-retryable conflict until current state is reviewed again', async () => {
  show();
  await createReview();
  confirm();
  failure = new ApiError(409, { code: 'VERSION_CONFLICT', message: 'changed', requestId: 'test' });
  submit();
  await screen.findByRole('button', { name: 'Review current category and schedule' });
  expect(screen.queryByRole('button', { name: 'Retry same category schedule request' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Confirm category schedule' })).toHaveProperty(
    'disabled',
    true,
  );
});
it('does not repopulate a hidden owner cache from a late successful request', async () => {
  let settle: ((response: unknown) => void) | undefined;
  const view = show();
  await createReview();
  confirm();
  mockedApi.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  );
  submit();
  await waitFor(() => expect(writes()).toHaveLength(1));
  view.rerender(<CategorySchedulesPanel enabled={false} />);
  await act(async () => {
    settle?.({ schedule: fixture(), current });
  });
  await waitFor(() =>
    expect(
      view.client.getQueryCache().findAll({ queryKey: categoryKeys.owner('event', 'manager') }),
    ).toHaveLength(0),
  );
  expect(screen.queryByRole('button', { name: 'Category schedules' })).toBeNull();
});
it('preserves the original uncertain attempt through a transient category-list failure and reload', async () => {
  show();
  await createReview();
  confirm();
  lostOnce = true;
  submit();
  await screen.findByRole('button', { name: 'Retry same category schedule request' });
  failure = new ApiError(503, {
    code: 'SERVER_ERROR',
    message: 'temporary read failure',
    requestId: 'test',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reload capture categories' }));
  await screen.findByText('Capture categories are unavailable. Reload before reviewing.');
  expect(screen.getByRole('button', { name: 'Retry same category schedule request' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Back to category schedules' })).toHaveProperty(
    'disabled',
    true,
  );
  failure = null;
  fireEvent.click(screen.getByRole('button', { name: 'Reload capture categories' }));
  await waitFor(() =>
    expect(
      screen.queryByText('Capture categories are unavailable. Reload before reviewing.'),
    ).toBeNull(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry same category schedule request' }));
  await screen.findByText(/Category schedule request confirmed/);
  expect(writes()).toHaveLength(2);
  expect(writes()[1]?.[1]?.body).toEqual(writes()[0]?.[1]?.body);
});
it('requires a new review when the configured event clock changes', async () => {
  const view = show();
  await createReview();
  confirm();
  identity.timezone = 'UTC';
  view.rerender(<CategorySchedulesPanel enabled />);
  expect(
    await screen.findByText('Category, schedule or event clock changed after your review.'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Confirm category schedule' })).toHaveProperty(
    'disabled',
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Review current category and schedule' }));
  await screen.findByLabelText('Change category at (UTC)');
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
  expect(writes()).toHaveLength(0);
});
it('does not load category endpoints with no view permission or no current clock', () => {
  const view = show(false);
  expect(mockedApi).not.toHaveBeenCalled();
  identity.timezone = '';
  view.rerender(<CategorySchedulesPanel enabled />);
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(mockedApi).not.toHaveBeenCalled();
});
it('hides cached schedule rows after a transient list failure and reloads them safely', async () => {
  rows = [fixture()];
  show();
  await expand();
  failure = new ApiError(503, {
    code: 'SERVER_ERROR',
    message: 'temporary read failure',
    requestId: 'test',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reload category schedules' }));
  await screen.findByText('Category schedules are unavailable. Reload before reviewing.');
  expect(screen.queryByRole('list', { name: 'Category schedule results' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Review future category change' })).toHaveProperty(
    'disabled',
    true,
  );
  failure = null;
  fireEvent.click(screen.getByRole('button', { name: 'Reload category schedules' }));
  await screen.findByRole('list', { name: 'Category schedule results' });
  expect(writes()).toHaveLength(0);
});
it('retains the uncertain request while a transient current-session error hides and blocks the workspace', async () => {
  const view = show();
  await createReview();
  confirm();
  lostOnce = true;
  submit();
  await screen.findByRole('button', { name: 'Retry same category schedule request' });
  const callsBefore = mockedApi.mock.calls.length;
  identity.meError = new ApiError(503, {
    code: 'SERVER_ERROR',
    message: 'session refresh unavailable',
    requestId: 'test',
  });
  view.rerender(<CategorySchedulesPanel enabled />);
  expect(screen.getByRole('alert').textContent).toContain(
    'Current event access and clock are unavailable',
  );
  expect(screen.queryByRole('group', { name: 'Review category schedule' })).toBeNull();
  const retainedRetry = screen.getByText('Retry same category schedule request', {
    selector: 'button',
  });
  expect(retainedRetry.closest('[hidden]')).toBeTruthy();
  expect(retainedRetry.closest('[inert]')).toBeTruthy();
  expect(retainedRetry).toHaveProperty('disabled', true);
  fireEvent.click(retainedRetry);
  expect(mockedApi.mock.calls).toHaveLength(callsBefore);
  expect(writes()).toHaveLength(1);
  identity.meError = null;
  view.rerender(<CategorySchedulesPanel enabled />);
  const recoveredRetry = await screen.findByRole('button', {
    name: 'Retry same category schedule request',
  });
  expect(recoveredRetry).toHaveProperty('disabled', false);
  fireEvent.click(recoveredRetry);
  await screen.findByText(/Category schedule request confirmed/);
  expect(writes()).toHaveLength(2);
  expect(writes()[1]?.[1]?.body).toEqual(writes()[0]?.[1]?.body);
});
it.each([401, 403])(
  'purges the uncertain workspace and owner cache on confirmed current-session HTTP %s',
  async (status) => {
    const view = show();
    await createReview();
    confirm();
    lostOnce = true;
    submit();
    await screen.findByRole('button', { name: 'Retry same category schedule request' });
    identity.meError = new ApiError(status, {
      code: status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      message: 'access unavailable',
      requestId: 'test',
    });
    view.rerender(<CategorySchedulesPanel enabled />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Retry same category schedule request')).toBeNull();
    await waitFor(() =>
      expect(
        view.client.getQueryCache().findAll({ queryKey: categoryKeys.owner('event', 'manager') }),
      ).toHaveLength(0),
    );
    expect(view.client.getQueryData(['unrelated-private-feature'])).toEqual({ preserved: true });
    expect(writes()).toHaveLength(1);
  },
);
it.each(['authority', 'person', 'event', 'clock'])(
  'purges an uncertain workspace after verified %s loss',
  async (loss) => {
    const view = show();
    await createReview();
    confirm();
    lostOnce = true;
    submit();
    await screen.findByRole('button', { name: 'Retry same category schedule request' });
    if (loss === 'authority') identity.allowed = false;
    if (loss === 'person') identity.personId = 'other-person';
    if (loss === 'event') identity.meEventId = 'other-event';
    if (loss === 'clock') identity.timezone = '';
    view.rerender(<CategorySchedulesPanel enabled />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Retry same category schedule request')).toBeNull();
    await waitFor(() =>
      expect(
        view.client.getQueryCache().findAll({ queryKey: categoryKeys.owner('event', 'manager') }),
      ).toHaveLength(0),
    );
    expect(writes()).toHaveLength(1);
  },
);
