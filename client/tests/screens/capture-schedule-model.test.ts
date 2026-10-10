import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/lib/apiErrors';
import {
  captureScheduleAllowed,
  captureScheduleBody,
  captureScheduleFailure,
  captureScheduleInstant,
  captureScheduleReviewStale,
} from '@/features/schedule/model/captureScheduleReview';
import { captureCurrent, captureSchedule } from '../helpers/captureSchedule';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2027-01-01T03:00:00Z');
});
afterEach(() => vi.useRealTimers());
it.each([
  ['2027-01-01T12:00', 'Asia/Singapore', '2027-01-01T04:00:00.000Z'],
  ['2027-10-31T01:30', 'Europe/London', '2027-10-31T00:30:00.000Z'],
  ['2027-03-28T01:30', 'Europe/London', '2027-03-28T01:00:00.000Z'],
])('interprets %s on the event clock %s', (wall, zone, instant) =>
  expect(captureScheduleInstant(wall, zone)).toBe(instant),
);
it.each(['2027-02-30T12:00', '2027-01-01T24:00', '2027-01-01T12:00:30', 'invalid'])(
  'refuses invalid wall time %s',
  (value) => expect(() => captureScheduleInstant(value, 'Asia/Singapore')).toThrow(),
);
it('refuses missing timezone and elapsed execution time', () => {
  expect(() => captureScheduleInstant('2027-01-01T12:00', '')).toThrow();
  expect(() =>
    captureScheduleBody({
      action: { kind: 'create' },
      current: captureCurrent(),
      timezone: 'Asia/Singapore',
      fields: { value: 'paused', wallTime: '2027-01-01T11:00', reason: 'Reviewed pause' },
    }),
  ).toThrow();
});
it('reviews an inherited station zero independently from its parent version', () => {
  const current = captureCurrent({ scope: 'station', stationId: 'station' });
  current.data.find((row) => row.key === 'capture.open')!.source = { scope: 'event', version: 9 };
  const body = captureScheduleBody({
    action: { kind: 'edit', schedule: captureSchedule(current, { version: 7 }) },
    current,
    timezone: 'Asia/Singapore',
    fields: { value: 'open', wallTime: '2027-01-01T12:00', reason: ' Reviewed edit ' },
  });
  expect(body).toMatchObject({
    expectedVersion: 0,
    expectedScheduleVersion: 7,
    value: true,
    reason: 'Reviewed edit',
    runAt: '2027-01-01T04:00:00.000Z',
  });
  expect(body).not.toHaveProperty('target');
  expect(body).not.toHaveProperty('key');
  const changed = structuredClone(current);
  changed.data.find((row) => row.key === 'capture.open')!.source.version = 10;
  expect(
    captureScheduleReviewStale({ action: { kind: 'create' }, reviewed: current, current: changed }),
  ).toBe(true);
});
it('schedules a typed catalogue value with the selected key and its independent version', () => {
  const current = captureCurrent({ scope: 'station', stationId: 'station' });
  const row = current.data.find((item) => item.key === 'silentStationMinutes')!;
  row.storedVersion = 4;
  const action = { kind: 'create' as const, key: 'silentStationMinutes' as const };
  expect(
    captureScheduleBody({
      action,
      current,
      timezone: 'Asia/Singapore',
      fields: { value: '12', wallTime: '2027-01-01T12:00', reason: 'Reviewed threshold' },
    }),
  ).toMatchObject({ key: 'silentStationMinutes', value: 12, expectedVersion: 4 });
  const changed = structuredClone(current);
  changed.data.find((item) => item.key === 'capture.open')!.storedVersion = 2;
  expect(captureScheduleReviewStale({ action, reviewed: current, current: changed })).toBe(false);
  changed.data.find((item) => item.key === 'silentStationMinutes')!.storedVersion = 5;
  expect(captureScheduleReviewStale({ action, reviewed: current, current: changed })).toBe(true);
});
it('cancellation ignores capture changes but refuses another schedule version or state', () => {
  const reviewed = captureCurrent();
  const action = { kind: 'cancel' as const, schedule: captureSchedule(reviewed) };
  const current = structuredClone(reviewed);
  current.data.find((row) => row.key === 'capture.open')!.storedVersion = 2;
  expect(captureScheduleReviewStale({ action, reviewed, current, latest: action.schedule })).toBe(
    false,
  );
  expect(
    captureScheduleReviewStale({
      action,
      reviewed,
      current,
      latest: { ...action.schedule, version: 2 },
    }),
  ).toBe(true);
  expect(
    captureScheduleReviewStale({
      action,
      reviewed,
      current,
      latest: { ...action.schedule, status: 'RUNNING' },
    }),
  ).toBe(true);
  expect(
    captureScheduleBody({
      action,
      current,
      timezone: '',
      fields: { value: 'paused', wallTime: 'invalid', reason: ' Stop action ' },
    }),
  ).toEqual({ expectedScheduleVersion: 1, reason: 'Stop action' });
});
it('allows manager cancellation and limits editing to the pending creator', () => {
  const current = captureCurrent();
  const other = captureSchedule(current, { createdByYou: false });
  expect(captureScheduleAllowed({ kind: 'edit', schedule: other }, current)).toBe(false);
  expect(captureScheduleAllowed({ kind: 'cancel', schedule: other }, current)).toBe(true);
  expect(
    captureScheduleAllowed({ kind: 'cancel', schedule: { ...other, status: 'RUNNING' } }, current),
  ).toBe(false);
  expect(captureScheduleAllowed({ kind: 'create' }, { ...current, eventStatus: 'ARCHIVED' })).toBe(
    false,
  );
});
it.each([429, 503, 500])('freezes uncertain HTTP %s writes', (status) =>
  expect(
    captureScheduleFailure(
      new ApiError(status, {
        code: 'INTERNAL_ERROR',
        message: 'private raw detail',
        requestId: 'test',
      }),
    ),
  ).toMatchObject({ uncertain: true, denied: false }),
);
it('keeps errors bounded and separates denied, uncertain and blocked outcomes', () => {
  expect(captureScheduleFailure(new Error('private raw detail')).uncertain).toBe(true);
  expect(
    captureScheduleFailure(
      new ApiError(409, { code: 'IDEMPOTENCY_IN_PROGRESS', message: 'private', requestId: 'test' }),
    ).uncertain,
  ).toBe(true);
  expect(
    captureScheduleFailure(
      new ApiError(403, { code: 'FORBIDDEN', message: 'private', requestId: 'test' }),
    ),
  ).toMatchObject({ denied: true, uncertain: false });
  const blocked = captureScheduleFailure(
    new ApiError(409, {
      code: 'SETTING_VERSION_CONFLICT',
      message: 'private raw detail',
      requestId: 'test',
    }),
  );
  expect(blocked.blocked).toBe(true);
  expect(blocked.error).not.toContain('private');
});
