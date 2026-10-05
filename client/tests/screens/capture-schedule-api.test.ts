import { beforeEach, expect, it, vi } from 'vitest';
import {
  GENERATED_SETTING_DEFAULTS,
  scopedOperationalKeys,
  type CaptureScheduleResponse,
} from '@spoh/shared';
import { api } from '@/shared/lib/api';
import {
  createCaptureSchedule,
  listCaptureSchedules,
  updateCaptureSchedule,
  cancelCaptureSchedule,
  getCaptureSchedule,
} from '@/features/schedule/api';

vi.mock('@/shared/lib/api', () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);
const eventId = 'evt_test';
const target = { scope: 'station' as const, stationId: 'station' };
const body = {
  target,
  key: 'capture.open' as const,
  value: false,
  expectedVersion: 0,
  runAt: '2027-01-01T10:00:00Z',
  reason: 'Reviewed pause',
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
};
const response: CaptureScheduleResponse = {
  current: {
    eventId,
    target,
    eventStatus: 'LIVE',
    evaluatedAt: '2027-01-01T00:00:00Z',
    data: scopedOperationalKeys('station').map((key) => ({
      key,
      value: GENERATED_SETTING_DEFAULTS[key],
      storedVersion: 0,
      source: { scope: 'default', version: 0 },
      invalidScopes: [],
    })),
  },
  schedule: {
    id: 'action',
    eventId,
    target,
    key: 'capture.open',
    value: true,
    expectedVersion: 0,
    reason: 'Later reviewed edit',
    kind: 'SETTING',
    recurring: false,
    scheduledFor: '2027-01-01T11:00:00Z',
    runAt: '2027-01-01T11:00:00Z',
    status: 'CANCELLED',
    version: 3,
    attempts: 0,
    maxAttempts: 5,
    createdByYou: true,
    createdAt: '2027-01-01T00:00:00Z',
    completedAt: '2027-01-01T00:01:00Z',
    lastError: null,
  },
};
beforeEach(() => mockedApi.mockReset());

it('accepts latest definition on an original successful creation replay', async () => {
  mockedApi.mockResolvedValue(response);
  expect((await createCaptureSchedule(eventId, body)).schedule).toEqual(response.schedule);
  expect(mockedApi).toHaveBeenCalledWith(`/events/${eventId}/admin/settings/catalogue/schedules`, {
    method: 'POST',
    body: { ...body, runAt: new Date(body.runAt).toISOString() },
    cache: 'no-store',
  });
});
it('encodes a cursor and retains an empty raw page with progress', async () => {
  mockedApi.mockResolvedValue({
    eventId,
    target,
    key: 'capture.open',
    evaluatedAt: response.current.evaluatedAt,
    data: [],
    meta: { count: 0, nextCursor: 'next' },
  });
  const result = await listCaptureSchedules(eventId, { target, cursor: 'page&limit=200' });
  expect(result.meta.nextCursor).toBe('next');
  expect(mockedApi).toHaveBeenCalledWith(
    `/events/${eventId}/admin/settings/catalogue/schedules?scope=station&key=capture.open&limit=20&stationId=station&cursor=page%26limit%3D200`,
    { cache: 'no-store' },
  );
});
it.each(['event', 'station', 'key', 'payload', 'error', 'count', 'duplicates'])(
  'refuses mismatched or unbounded %s list data',
  async (kind) => {
    const row = { ...response.schedule };
    const page = {
      eventId,
      target,
      key: 'capture.open',
      evaluatedAt: response.current.evaluatedAt,
      data: [row],
      meta: { count: 1, nextCursor: null },
    };
    const malformed =
      kind === 'event'
        ? { ...page, eventId: 'other' }
        : kind === 'station'
          ? {
              ...page,
              target: { scope: 'station', stationId: 'other' },
              data: [{ ...row, target: { scope: 'station', stationId: 'other' } }],
            }
          : kind === 'key'
            ? { ...page, key: 'counts.mode' }
            : kind === 'count'
              ? { ...page, meta: { count: 2, nextCursor: null } }
              : kind === 'duplicates'
                ? { ...page, data: [row, row], meta: { count: 2, nextCursor: null } }
                : {
                    ...page,
                    data: [
                      {
                        ...row,
                        ...(kind === 'payload'
                          ? { payload: {} }
                          : { lastError: 'raw database detail' }),
                      },
                    ],
                  };
    mockedApi.mockResolvedValue(malformed);
    await expect(listCaptureSchedules(eventId, { target })).rejects.toThrow();
  },
);
it('edits and cancels with distinct schemas while accepting later cancelled state', async () => {
  mockedApi.mockResolvedValue(response);
  const { target: _target, key: _key, ...editable } = body;
  const edit = { ...editable, expectedScheduleVersion: 1 };
  expect(
    (await updateCaptureSchedule(eventId, { id: 'action', target, body: edit })).schedule.version,
  ).toBe(3);
  const cancel = {
    expectedScheduleVersion: 2,
    reason: 'Reviewed cancellation',
    idempotencyKey: body.idempotencyKey,
  };
  expect(
    (await cancelCaptureSchedule(eventId, { id: 'action', target, body: cancel })).schedule.status,
  ).toBe('CANCELLED');
  expect(mockedApi.mock.calls[0]?.[1]?.method).toBe('PATCH');
  expect(mockedApi.mock.calls[1]).toEqual([
    `/events/${eventId}/admin/settings/catalogue/schedules/action/cancel`,
    { method: 'POST', body: cancel, cache: 'no-store' },
  ]);
});
it('encodes identifiers and refuses another action on read or mutation', async () => {
  mockedApi.mockResolvedValue(response);
  await expect(getCaptureSchedule(eventId, { id: 'action/other', target })).rejects.toThrow();
  expect(mockedApi.mock.calls[0]?.[0]).toBe(
    `/events/${eventId}/admin/settings/catalogue/schedules/action%2Fother`,
  );
  await expect(
    cancelCaptureSchedule(eventId, {
      id: 'another',
      target,
      body: {
        expectedScheduleVersion: 1,
        reason: 'Reviewed cancellation',
        idempotencyKey: body.idempotencyKey,
      },
    }),
  ).rejects.toThrow();
});
