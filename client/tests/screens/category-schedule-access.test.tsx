import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  CreateCategoryScheduleRequest,
  type CategoryActivityResponse,
  type CategoryScheduleRecord,
  type MeResponse,
} from '@spoh/shared';
import { CategorySchedulesPanel } from '@/features/taxonomy';
import { categoryKeys } from '@/features/taxonomy/queries';
import { sessionKeys } from '@/features/session';
import { api } from '@/shared/lib/api';
import { ApiError } from '@/shared/lib/apiErrors';
import { setSession } from '@/shared/lib/session';
import { permissionsFor } from '../helpers/permissions';
import { TEST_EVENT } from '../helpers/event';

vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const clients: QueryClient[] = [];
const now = '2027-01-01T03:00:00.000Z';
const me: MeResponse = {
  volunteer: {
    id: 'manager',
    displayName: 'Fixture manager',
    role: 'CHIEF_COORDINATOR',
    portfolio: null,
    active: true,
  },
  event: {
    id: TEST_EVENT.id,
    name: TEST_EVENT.name,
    status: 'LIVE',
    timezone: TEST_EVENT.timezone,
    locale: TEST_EVENT.locale,
  },
  currentAssignment: null,
  upcomingAssignments: [],
  escalationChain: [],
  serverTime: now,
};
const current: CategoryActivityResponse = {
  eventId: TEST_EVENT.id,
  eventStatus: 'LIVE',
  evaluatedAt: now,
  data: {
    id: 'category',
    code: 'CRAFT',
    label: 'Craft category',
    sortOrder: 1,
    active: true,
    updatedAt: '2027-01-01T02:00:00.000Z',
  },
};
let meError: ApiError | null;
let loseResponse: boolean;
let saved: CategoryScheduleRecord | null;
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(['unrelated-private-feature'], { preserved: true });
  clients.push(client);
  return {
    client,
    ...render(<CategorySchedulesPanel enabled />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}
function writes() {
  return mockedApi.mock.calls.filter(([, options]) => options?.method === 'POST');
}
async function uncertainReview() {
  fireEvent.click(await screen.findByRole('button', { name: 'Category schedules' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Capture category')).toHaveProperty('disabled', false),
  );
  fireEvent.change(screen.getByLabelText('Capture category'), { target: { value: 'category' } });
  const review = await screen.findByRole('button', { name: 'Review future category change' });
  await waitFor(() => expect(review).toHaveProperty('disabled', false));
  fireEvent.click(review);
  fireEvent.change(screen.getByLabelText('Reason for category schedule'), {
    target: { value: 'Reviewed future category action' },
  });
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I have reviewed the current category, schedule and effects',
    }),
  );
  loseResponse = true;
  fireEvent.click(screen.getByRole('button', { name: 'Confirm category schedule' }));
  await screen.findByRole('button', { name: 'Retry same category schedule request' });
}
async function refreshMe(client: QueryClient) {
  await act(async () => {
    await client.refetchQueries({ queryKey: sessionKeys.me(TEST_EVENT.id), exact: true });
  });
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  setSession({
    accessToken: 'fixture-access-token',
    volunteerId: 'manager',
    displayName: 'Fixture manager',
    role: 'CHIEF_COORDINATOR',
    expiresAt: Date.now() + 3_600_000,
    refreshAvailable: false,
  });
  meError = null;
  loseResponse = false;
  saved = null;
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (path, options) => {
    if (path.endsWith('/me')) {
      if (meError) throw meError;
      return me;
    }
    if (path.endsWith('/me/permissions')) return permissionsFor(['Schedule.Manage']);
    if (options?.method === 'POST') {
      const body = CreateCategoryScheduleRequest.parse(options.body);
      saved ??= {
        id: 'owned-action',
        eventId: TEST_EVENT.id,
        categoryId: current.data.id,
        kind: 'CAPTURE_CATEGORY',
        recurring: false,
        active: body.active,
        expectedActive: body.expectedActive,
        expectedUpdatedAt: body.expectedUpdatedAt,
        reason: body.reason,
        status: 'PENDING',
        version: 1,
        attempts: 0,
        maxAttempts: 5,
        createdByYou: true,
        createdAt: now,
        scheduledFor: body.runAt,
        runAt: body.runAt,
        completedAt: null,
        lastError: null,
      };
      if (loseResponse) {
        loseResponse = false;
        throw new Error('response lost after commit');
      }
      return { schedule: saved, current };
    }
    if (path.includes('/schedules?'))
      return {
        eventId: TEST_EVENT.id,
        categoryId: current.data.id,
        evaluatedAt: now,
        data: saved ? [saved] : [],
        meta: { count: saved ? 1 : 0, nextCursor: null },
      };
    if (path.includes('/capture-categories?'))
      return {
        eventId: TEST_EVENT.id,
        eventStatus: 'LIVE',
        evaluatedAt: now,
        data: [current.data],
        meta: { count: 1, nextCursor: null },
      };
    return current;
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  setSession(null);
  vi.useRealTimers();
});

it('preserves the exact uncertain request through a real cached /me 503 and recovery', async () => {
  const view = show();
  await uncertainReview();
  meError = new ApiError(503, {
    code: 'SERVER_ERROR',
    message: 'current access lookup unavailable',
    requestId: 'test',
  });
  await refreshMe(view.client);
  await screen.findByText(/Current event access and clock are unavailable/);
  expect(view.client.getQueryState(sessionKeys.me(TEST_EVENT.id))?.status).toBe('error');
  expect(view.client.getQueryData(sessionKeys.me(TEST_EVENT.id))).toEqual(me);
  expect(screen.getByRole('alert').textContent).toContain(
    'Current event access and clock are unavailable',
  );
  const retry = screen.getByText('Retry same category schedule request', { selector: 'button' });
  expect(retry.closest('[hidden]')).toBeTruthy();
  expect(retry.closest('[inert]')).toBeTruthy();
  expect(retry).toHaveProperty('disabled', true);
  const reload = screen.getByText('Reload capture categories', { selector: 'button' });
  expect(reload).toHaveProperty('disabled', true);
  const callsBefore = mockedApi.mock.calls.length;
  fireEvent.click(retry);
  fireEvent.click(reload);
  await act(async () => {
    await view.client.invalidateQueries({ queryKey: categoryKeys.owner(TEST_EVENT.id, 'manager') });
  });
  expect(mockedApi.mock.calls).toHaveLength(callsBefore);
  meError = null;
  await refreshMe(view.client);
  const recovered = await screen.findByRole('button', {
    name: 'Retry same category schedule request',
  });
  expect(recovered).toHaveProperty('disabled', false);
  fireEvent.click(recovered);
  await screen.findByText(/Category schedule request confirmed/);
  expect(writes()).toHaveLength(2);
  expect(writes()[1]?.[1]?.body).toEqual(writes()[0]?.[1]?.body);
});
it.each([401, 403])(
  'clears the uncertain owner after a real /me HTTP %s refetch',
  async (status) => {
    const view = show();
    await uncertainReview();
    meError = new ApiError(status, {
      code: status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      message: 'current access lost',
      requestId: 'test',
    });
    await refreshMe(view.client);
    await screen.findByText(/Current event access and clock are unavailable/);
    expect(view.client.getQueryState(sessionKeys.me(TEST_EVENT.id))?.status).toBe('error');
    expect(screen.getByRole('alert')).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByText('Retry same category schedule request')).toBeNull(),
    );
    await waitFor(() =>
      expect(
        view.client
          .getQueryCache()
          .findAll({ queryKey: categoryKeys.owner(TEST_EVENT.id, 'manager') }),
      ).toHaveLength(0),
    );
    expect(view.client.getQueryData(['unrelated-private-feature'])).toEqual({ preserved: true });
    expect(writes()).toHaveLength(1);
  },
);
it('clears an uncertain review immediately when the actual session signs out', async () => {
  const view = show();
  await uncertainReview();
  act(() => setSession(null));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.queryByText('Retry same category schedule request')).toBeNull();
  await waitFor(() =>
    expect(
      view.client
        .getQueryCache()
        .findAll({ queryKey: categoryKeys.owner(TEST_EVENT.id, 'manager') }),
    ).toHaveLength(0),
  );
  expect(writes()).toHaveLength(1);
});
