import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleTimelineRecord } from '@spoh/shared';
import { createLifecycleSchedule } from '@/features/schedule/api';
import { ScheduleCancelButton } from '@/features/schedule/components/ScheduleCancelButton';
import { ScheduleLifecycleForm } from '@/features/schedule/components/ScheduleLifecycleForm';
import { ScheduleReportForm } from '@/features/schedule/components/ScheduleReportForm';
import {
  cancellableHere,
  lifecycleScheduleBody,
  reportScheduleBody,
} from '@/features/schedule/model/producerForms';
import { api } from '@/shared/lib/api';
import { TEST_EVENT } from '../helpers/event';

const readiness = vi.hoisted(() => ({
  isPending: false,
  data: {
    lifecycle: { eventId: 'evt_test', status: 'DRAFT', version: 3, hasBeenLive: false },
    transitions: [{ to: 'READY', allowed: false, requiresReason: false, blockers: ['event-days'] }],
  },
}));
vi.mock('@/features/events', () => ({ useLifecycleReadiness: () => readiness }));
vi.mock('@/features/session', async (original) => ({
  ...(await original<typeof import('@/features/session')>()),
  useCurrentSession: () => ({ volunteerId: 'schedule-admin' }),
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const root = `/events/${TEST_EVENT.id}/schedules`;

function record(overrides: Partial<ScheduleTimelineRecord> = {}): ScheduleTimelineRecord {
  return {
    id: 'scheduled-1',
    eventId: TEST_EVENT.id,
    kind: 'LIFECYCLE',
    status: 'PENDING',
    version: 1,
    attempts: 0,
    maxAttempts: 5,
    recurring: false,
    createdByYou: true,
    scheduledFor: '2027-01-07T01:00:00.000Z',
    runAt: '2027-01-07T01:00:00.000Z',
    createdAt: '2027-01-01T00:00:00.000Z',
    completedAt: null,
    lastError: null,
    ...overrides,
  };
}
function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
beforeEach(() => {
  mockedApi.mockReset();
});
afterEach(() => {
  cleanup();
});

describe('the producer form model', () => {
  it('reads the wall time on the event clock and drops a blank reason', () => {
    expect(
      lifecycleScheduleBody({
        fields: { to: 'READY', wallTime: '2027-01-07T09:00', reason: '  ' },
        expectedVersion: 3,
        timezone: 'Asia/Singapore',
        idempotencyKey: 'key',
      }),
    ).toEqual({
      to: 'READY',
      expectedVersion: 3,
      runAt: '2027-01-07T01:00:00.000Z',
      idempotencyKey: 'key',
    });
  });

  it('builds a report schedule and refuses an impossible time', () => {
    const fields = { eventDayId: 'day-1', wallTime: '2027-01-07T21:30', includeRehearsal: true };
    expect(reportScheduleBody({ fields, timezone: 'Asia/Singapore', idempotencyKey: 'k' })).toEqual(
      { eventDayId: 'day-1', includeRehearsal: true, runAt: '2027-01-07T13:30:00.000Z', idempotencyKey: 'k' },
    );
    expect(() =>
      reportScheduleBody({ fields: { ...fields, wallTime: 'soon' }, timezone: 'Asia/Singapore', idempotencyKey: 'k' }),
    ).toThrow(/event clock/);
  });

  it('offers cancel only for pending kinds this screen produces', () => {
    expect(cancellableHere(record())).toBe(true);
    expect(cancellableHere(record({ kind: 'REPORT' }))).toBe(true);
    expect(cancellableHere(record({ status: 'SUCCEEDED' }))).toBe(false);
    expect(cancellableHere(record({ kind: 'ANNOUNCEMENT' }))).toBe(false);
  });
});

describe('the producer API', () => {
  it('posts a lifecycle schedule and refuses another event’s answer', async () => {
    mockedApi.mockResolvedValueOnce({ schedule: record() });
    const body = {
      to: 'READY' as const,
      expectedVersion: 3,
      runAt: '2027-01-07T01:00:00.000Z',
      idempotencyKey: crypto.randomUUID(),
    };
    await createLifecycleSchedule(TEST_EVENT.id, body);
    expect(mockedApi).toHaveBeenCalledWith(`${root}/lifecycle`, {
      method: 'POST',
      body,
      cache: 'no-store',
    });
    mockedApi.mockResolvedValueOnce({ schedule: record({ eventId: 'other' }) });
    await expect(createLifecycleSchedule(TEST_EVENT.id, body)).rejects.toThrow(/mismatch/);
  });
});

describe('the lifecycle form', () => {
  it('schedules a reviewed transition against the version it read', async () => {
    mockedApi.mockResolvedValue({ schedule: record() });
    show(<ScheduleLifecycleForm timezone="Asia/Singapore" />);
    expect(screen.getByRole('option', { name: 'Ready (blocked right now)' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Move the event to'), { target: { value: 'READY' } });
    fireEvent.change(screen.getByLabelText('Change at (Asia/Singapore)'), {
      target: { value: '2027-01-07T09:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule lifecycle change' }));
    await screen.findByText(/^Scheduled\./);
    expect(mockedApi).toHaveBeenCalledWith(`${root}/lifecycle`, {
      method: 'POST',
      body: expect.objectContaining({
        to: 'READY',
        expectedVersion: 3,
        runAt: '2027-01-07T01:00:00.000Z',
      }),
      cache: 'no-store',
    });
  });

  it('asks for a time before sending anything', async () => {
    show(<ScheduleLifecycleForm timezone="Asia/Singapore" />);
    fireEvent.change(screen.getByLabelText('Move the event to'), { target: { value: 'READY' } });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule lifecycle change' }));
    await screen.findByText(/Choose a date and time/);
    expect(mockedApi).not.toHaveBeenCalled();
  });
});

describe('the report form', () => {
  it('lists the event days and schedules a snapshot of one', async () => {
    mockedApi.mockImplementation(async (path) =>
      String(path).endsWith('/admin/event-days')
        ? {
            data: [
              {
                id: 'day-1',
                date: '2027-01-07',
                label: 'Day one',
                isPublicDay: true,
                isTourDay: false,
                assignmentCount: 0,
                shifts: [],
                createdAt: '2026-10-01T00:00:00.000Z',
              },
            ],
            meta: { count: 1, nextCursor: null },
          }
        : { schedule: record({ kind: 'REPORT' }) },
    );
    show(<ScheduleReportForm timezone="Asia/Singapore" />);
    await screen.findByRole('option', { name: 'Day one · 2027-01-07' });
    fireEvent.change(screen.getByLabelText('Day to report on'), { target: { value: 'day-1' } });
    fireEvent.change(screen.getByLabelText('Take the snapshot at (Asia/Singapore)'), {
      target: { value: '2027-01-07T21:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule report snapshot' }));
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(`${root}/reports`, {
        method: 'POST',
        body: expect.objectContaining({ eventDayId: 'day-1', runAt: '2027-01-07T13:30:00.000Z' }),
        cache: 'no-store',
      }),
    );
  });
});

describe('cancelling from the timeline', () => {
  it('cancels a pending lifecycle schedule at the version in the row', async () => {
    mockedApi.mockResolvedValue({ schedule: record({ status: 'CANCELLED', version: 2 }) });
    show(<ScheduleCancelButton row={record()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel this schedule' }));
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(`${root}/scheduled-1/cancel`, {
        method: 'POST',
        body: expect.objectContaining({ expectedVersion: 1 }),
        cache: 'no-store',
      }),
    );
  });

  it('shows nothing for work another editor owns', () => {
    const { container } = show(<ScheduleCancelButton row={record({ kind: 'ANNOUNCEMENT' })} />);
    expect(container.textContent).toBe('');
  });
});
