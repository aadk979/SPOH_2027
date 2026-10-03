import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleTimelineRecord, ScheduleTimelineResponse } from '@spoh/shared';
import { ScheduleError, ScheduleKind, ScheduledActionStatus } from '@spoh/shared';
import { ScheduleTimelinePanel } from '@/features/schedule';
import { listScheduleTimeline } from '@/features/schedule/api';
import { scheduleTimelineKeys } from '@/features/schedule/queries';
import {
  scheduleErrorLabels,
  scheduleKindLabels,
  scheduleStatusLabels,
} from '@/features/schedule/model/copy';
import { api } from '@/shared/lib/api';
import { ApiError } from '@/shared/lib/apiErrors';
import { TEST_EVENT } from '../helpers/event';

const session = vi.hoisted(() => ({ personId: 'timeline-admin' }));
vi.mock('@/features/session', async (original) => ({
  ...(await original<typeof import('@/features/session')>()),
  useCurrentSession: () => (session.personId ? { volunteerId: session.personId } : null),
  useEventTime: () => ({ dateTime: (value: string) => `event-clock:${value}` }),
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const clients: QueryClient[] = [];
const endpoint = `/events/${TEST_EVENT.id}/schedules`;
function row(overrides: Partial<ScheduleTimelineRecord> = {}): ScheduleTimelineRecord {
  return {
    id: 'scheduled-1',
    eventId: TEST_EVENT.id,
    kind: 'ANNOUNCEMENT',
    status: 'PENDING',
    version: 1,
    attempts: 0,
    maxAttempts: 3,
    recurring: false,
    createdByYou: true,
    scheduledFor: '2027-01-01T02:00:00Z',
    runAt: '2027-01-01T02:00:00Z',
    createdAt: '2027-01-01T00:00:00Z',
    completedAt: null,
    lastError: null,
    ...overrides,
  };
}
function page(rows = [row()], nextCursor: string | null = null): ScheduleTimelineResponse {
  return {
    eventId: TEST_EVENT.id,
    evaluatedAt: '2027-01-01T01:00:00Z',
    data: rows,
    meta: { count: rows.length, nextCursor },
  };
}
function show(enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return {
    client,
    ...render(<ScheduleTimelinePanel enabled={enabled} />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}
async function expand() {
  fireEvent.click(screen.getByRole('button', { name: /^Scheduled work$/ }));
  await screen.findByText(/Checked event-clock/);
}
beforeEach(() => {
  session.personId = 'timeline-admin';
  mockedApi.mockReset();
  mockedApi.mockResolvedValue(page());
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe('event schedule metadata view', () => {
  it('fetches only after expansion, defaults to pending and uses the event clock', async () => {
    const { client } = show();
    expect(mockedApi).not.toHaveBeenCalled();
    await expand();
    expect(mockedApi).toHaveBeenCalledWith(`${endpoint}?limit=20&status=PENDING`);
    expect(screen.getByText('Scheduled for event-clock:2027-01-01T02:00:00Z')).toBeTruthy();
    expect(screen.getByText('Scheduled by you')).toBeTruthy();
    expect(
      client.getQueryData(scheduleTimelineKeys.list(TEST_EVENT.id, session.personId, 'PENDING')),
    ).toBeTruthy();
    expect(mockedApi.mock.calls.every(([, options]) => !options?.method)).toBe(true);
  });
  it.each(ScheduledActionStatus.options)('filters %s using its own first page', async (status) => {
    mockedApi.mockImplementation(async () => page([row({ status })]));
    show();
    await expand();
    fireEvent.change(screen.getByLabelText('Schedule status'), { target: { value: status } });
    await waitFor(() =>
      expect(mockedApi).toHaveBeenLastCalledWith(`${endpoint}?limit=20&status=${status}`),
    );
    expect(screen.getByRole('option', { name: scheduleStatusLabels[status] })).toBeTruthy();
  });
  it('omits status for all and shows an empty result', async () => {
    show();
    await expand();
    mockedApi.mockResolvedValue(page([]));
    fireEvent.change(screen.getByLabelText('Schedule status'), { target: { value: 'ALL' } });
    await screen.findByText('No scheduled work matches this status.');
    expect(mockedApi).toHaveBeenLastCalledWith(`${endpoint}?limit=20`);
  });
  it('loads a bounded next page and resets the cursor when changing filter', async () => {
    mockedApi.mockImplementation(async (path) =>
      path.includes('cursor=')
        ? page([row({ id: 'scheduled-2', kind: 'REPORT' })])
        : page([row()], 'scheduled-1'),
    );
    show();
    await expand();
    fireEvent.click(screen.getByRole('button', { name: 'Load more scheduled work' }));
    await screen.findByText('Report snapshot');
    expect(mockedApi).toHaveBeenLastCalledWith(
      `${endpoint}?limit=20&status=PENDING&cursor=scheduled-1`,
    );
    fireEvent.change(screen.getByLabelText('Schedule status'), { target: { value: 'FAILED' } });
    await waitFor(() =>
      expect(mockedApi).toHaveBeenLastCalledWith(`${endpoint}?limit=20&status=FAILED`),
    );
    expect(screen.queryByText('Report snapshot')).toBeNull();
  });
  it('hides cached rows and further paging after a current-authority denial', async () => {
    show();
    await expand();
    mockedApi.mockRejectedValue(
      new ApiError(403, {
        message: 'Permission changed',
        code: 'FORBIDDEN',
        requestId: 'synthetic',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload scheduled work' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Announcement publication')).toBeNull();
    expect(screen.queryByText(/Checked event-clock/)).toBeNull();
  });
  it('unmounts private metadata on permission loss or sign-out', async () => {
    const view = show();
    await expand();
    view.rerender(<ScheduleTimelinePanel enabled={false} />);
    expect(screen.queryByText('Announcement publication')).toBeNull();
    session.personId = '';
    view.rerender(<ScheduleTimelinePanel enabled />);
    expect(screen.queryByRole('button', { name: /^Scheduled work$/ })).toBeNull();
  });
  it('never displays a previous person’s cached result while the next person reads', async () => {
    const view = show();
    await expand();
    mockedApi.mockImplementation(() => new Promise(() => {}));
    session.personId = 'next-person';
    view.rerender(<ScheduleTimelinePanel enabled />);
    expect(screen.queryByText('Announcement publication')).toBeNull();
    await waitFor(() =>
      expect(
        view.client.getQueryState(
          scheduleTimelineKeys.list(TEST_EVENT.id, 'next-person', 'PENDING'),
        ),
      ).toBeTruthy(),
    );
  });
  it('formats retries, completion and recurrence without private payloads', async () => {
    mockedApi.mockResolvedValue(
      page([
        row({
          status: 'FAILED',
          recurring: true,
          createdByYou: false,
          attempts: 3,
          runAt: '2027-01-01T02:01:00Z',
          completedAt: '2027-01-01T02:02:00Z',
          lastError: 'ATTEMPTS_EXHAUSTED',
        }),
      ]),
    );
    show();
    await expand();
    expect(screen.getByText(/Last attempt scheduled for event-clock/)).toBeTruthy();
    expect(screen.getByText(/Attempts 3 of 3 · Repeats automatically/)).toBeTruthy();
    expect(screen.getByText(/Finished event-clock/)).toBeTruthy();
    expect(screen.getByText('The retry limit was reached.')).toBeTruthy();
    expect(screen.queryByText('Scheduled by you')).toBeNull();
  });
  it('covers every bounded kind, status and worker error with safe human wording', () => {
    for (const value of ScheduleKind.options) expect(scheduleKindLabels[value]).toBeTruthy();
    for (const value of ScheduleError.options) expect(scheduleErrorLabels[value]).toBeTruthy();
  });
  it.each(['wrong event', 'private payload', 'unknown status', 'count mismatch'])(
    'rejects %s before display',
    async (problem) => {
      const response = page();
      if (problem === 'wrong event') {
        response.eventId = 'other-event';
        response.data[0]!.eventId = 'other-event';
      }
      if (problem === 'private payload')
        Object.assign(response.data[0]!, { payload: { secret: 'never-display' } });
      if (problem === 'unknown status') Object.assign(response.data[0]!, { status: 'UNKNOWN' });
      if (problem === 'count mismatch') response.meta.count = 50;
      mockedApi.mockResolvedValue(response);
      await expect(listScheduleTimeline(TEST_EVENT.id, {})).rejects.toThrow();
    },
  );
});
