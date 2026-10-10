import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { CaptureScheduleControls } from '@/features/schedule';
import { api } from '@/shared/lib/api';
import { captureCurrent, captureSchedule } from '../helpers/captureSchedule';
import { permissionsFor } from '../helpers/permissions';

vi.mock('@/features/session', async (original) => ({
  ...(await original<typeof import('@/features/session')>()),
  ...(await import('../helpers/permissions')).permissionHooks(() =>
    permissionsFor(['Schedule.Manage']),
  ),
  useCurrentSession: () => ({ volunteerId: 'manager' }),
  useMe: () => ({
    data: { volunteer: { id: 'manager' }, event: { id: 'evt_test', timezone: 'Asia/Singapore' } },
  }),
  useEventTime: () => ({ dateTime: (value: string) => value }),
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('reviews and creates a generated numeric schedule through the existing durable producer', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2027-01-01T03:00:00Z');
  const current = captureCurrent();
  const writes: unknown[] = [];
  vi.mocked(api).mockImplementation(async (_path, options) => {
    if (options?.method) {
      writes.push(options.body);
      return {
        schedule: captureSchedule(current, {
          key: 'silentStationMinutes',
          value: 12,
          status: 'PENDING',
        }),
        current,
      };
    }
    return {
      eventId: current.eventId,
      target: current.target,
      key: 'silentStationMinutes',
      evaluatedAt: current.evaluatedAt,
      data: [],
      meta: { count: 0, nextCursor: null },
    };
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CaptureScheduleControls
        settingKey="silentStationMinutes"
        current={current}
        readUnavailable={false}
        loadCurrent={async () => current}
        onApplied={vi.fn()}
        onClose={vi.fn()}
        onDenied={vi.fn()}
        onLockChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  const create = await screen.findByRole('button', { name: 'Review future change: Silent station' });
  await waitFor(() => expect(create).toHaveProperty('disabled', false));
  fireEvent.click(create);
  fireEvent.change(screen.getByLabelText('Proposed value'), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText('Change setting at (Asia/Singapore)'), {
    target: { value: '2027-01-01T12:00' },
  });
  fireEvent.change(screen.getByLabelText('Reason for setting schedule'), {
    target: { value: 'Reviewed operational threshold' },
  });
  fireEvent.click(
    screen.getByLabelText('I have reviewed the current setting value, schedule and effects'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirm setting schedule' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    key: 'silentStationMinutes',
    value: 12,
    target: { scope: 'event' },
    expectedVersion: 0,
    runAt: '2027-01-01T04:00:00.000Z',
  });
  client.clear();
});
