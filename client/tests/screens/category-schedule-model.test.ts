import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  CategoryActivityResponse,
  CategoryScheduleRecord,
  MeResponse,
  ScheduledActionStatus,
} from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';
import {
  categoryAccessUnavailable,
  categoryClock,
  categorySchedulingIdentity,
} from '@/features/taxonomy/model/access';
import {
  categoryScheduleAllowed,
  categoryScheduleAttempt,
  categoryScheduleBody,
  categoryScheduleFailure,
  categoryScheduleFields,
  categoryScheduleInstant,
  categoryScheduleStale,
} from '@/features/taxonomy/model/categoryScheduleReview';

const current: CategoryActivityResponse = {
  eventId: 'event',
  eventStatus: 'LIVE',
  evaluatedAt: '2027-01-01T03:00:00Z',
  data: {
    id: 'category',
    code: 'CRAFT',
    label: 'Craft',
    sortOrder: 1,
    active: true,
    updatedAt: '2027-01-01T02:00:00Z',
  },
};
const schedule: CategoryScheduleRecord = {
  id: 'action',
  eventId: 'event',
  categoryId: 'category',
  kind: 'CAPTURE_CATEGORY',
  recurring: false,
  active: false,
  expectedActive: true,
  expectedUpdatedAt: current.data.updatedAt,
  reason: 'Reviewed deactivation',
  status: 'PENDING',
  version: 2,
  attempts: 0,
  maxAttempts: 5,
  createdByYou: true,
  createdAt: current.evaluatedAt,
  scheduledFor: '2027-01-01T05:00:00Z',
  runAt: '2027-01-01T05:00:00Z',
  completedAt: null,
  lastError: null,
};
const fields = {
  active: 'inactive' as const,
  wallTime: '2027-01-01T13:00',
  reason: '  Reviewed deactivation  ',
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(current.evaluatedAt);
});
afterEach(() => {
  vi.useRealTimers();
});

it.each([
  {
    missing: 'event',
    value: { volunteer: { id: 'manager' }, capabilities: ['config.manage'] },
    clock: '',
  },
  {
    missing: 'volunteer',
    value: { event: { id: 'event', timezone: 'Asia/Singapore' }, capabilities: ['config.manage'] },
    clock: 'Asia/Singapore',
  },
  {
    missing: 'capabilities',
    value: { event: { id: 'event', timezone: 'Asia/Singapore' }, volunteer: { id: 'manager' } },
    clock: 'Asia/Singapore',
  },
])('fails closed when compatibility /me data lacks $missing metadata', ({ value, clock }) => {
  // A response from an older API can omit metadata despite the current DTO type.
  const response = value as unknown as MeResponse;
  expect(categorySchedulingIdentity(response, 'manager', 'event')).toBe(false);
  expect(categoryClock(response)).toBe(clock);
});
it('fails closed when otherwise matched compatibility /me data lacks its event clock', () => {
  const response = {
    event: { id: 'event' },
    volunteer: { id: 'manager' },
    capabilities: ['config.manage'],
  } as unknown as MeResponse;
  expect(
    categoryAccessUnavailable({
      authorised: categorySchedulingIdentity(response, 'manager', 'event'),
      accessLost: false,
      timezone: categoryClock(response),
    }),
  ).toBe(true);
});

it('uses the configured event clock and reviewed snapshot for a future absolute state', () => {
  expect(
    categoryScheduleBody({
      action: { kind: 'create' },
      current,
      fields,
      timezone: 'Asia/Singapore',
    }),
  ).toEqual({
    active: false,
    runAt: '2027-01-01T05:00:00.000Z',
    reason: 'Reviewed deactivation',
    expectedActive: true,
    expectedUpdatedAt: current.data.updatedAt,
  });
  expect(categoryScheduleFields({ kind: 'create' }, current, 'Asia/Singapore')).toEqual({
    active: 'inactive',
    wallTime: '2027-01-01T11:05',
    reason: '',
  });
});
it('keeps scheduled desired state separate from a newly reviewed category snapshot on edit', () => {
  const changed = {
    ...current,
    data: { ...current.data, active: false, updatedAt: '2027-01-01T02:59:00Z' },
  };
  expect(
    categoryScheduleBody({
      action: { kind: 'edit', schedule },
      current: changed,
      fields,
      timezone: 'Asia/Singapore',
    }),
  ).toMatchObject({
    active: false,
    expectedActive: false,
    expectedUpdatedAt: changed.data.updatedAt,
    expectedScheduleVersion: 2,
  });
});
it('cancellation checks only schedule version and reason, without a category timestamp floor', () => {
  expect(
    categoryScheduleBody({
      action: { kind: 'cancel', schedule },
      current,
      fields: { ...fields, wallTime: 'invalid' },
      timezone: '',
    }),
  ).toEqual({ expectedScheduleVersion: 2, reason: 'Reviewed deactivation' });
});
it.each(['2027-01-01T24:00', '2027-02-30T12:00', 'invalid', '2027-01-01T12:00T00'])(
  'refuses malformed wall time %s',
  (value) => {
    expect(() => categoryScheduleInstant(value, 'Asia/Singapore')).toThrow();
  },
);
it('refuses past execution time and missing event timezone', () => {
  expect(() =>
    categoryScheduleBody({
      action: { kind: 'create' },
      current,
      fields: { ...fields, wallTime: '2027-01-01T11:00' },
      timezone: 'Asia/Singapore',
    }),
  ).toThrow('future');
  expect(() => categoryScheduleInstant(fields.wallTime, '')).toThrow();
});
it.each(['active', 'updatedAt', 'eventId', 'categoryId'])(
  'requires a new create review when %s changes',
  (change) => {
    const latest =
      change === 'eventId'
        ? { ...current, eventId: 'other' }
        : {
            ...current,
            data: {
              ...current.data,
              ...(change === 'active'
                ? { active: false }
                : change === 'updatedAt'
                  ? { updatedAt: '2027-01-01T02:01:00Z' }
                  : { id: 'other' }),
            },
          };
    expect(
      categoryScheduleStale({ action: { kind: 'create' }, reviewed: current, current: latest }),
    ).toBe(true);
  },
);
it('allows timestamp-only category changes for cancellation but detects schedule changes/missing rows', () => {
  const action = { kind: 'cancel' as const, schedule };
  const changed = {
    ...current,
    data: { ...current.data, active: false, updatedAt: '2027-01-01T02:01:00Z' },
  };
  expect(
    categoryScheduleStale({ action, reviewed: current, current: changed, latest: schedule }),
  ).toBe(false);
  expect(
    categoryScheduleStale({
      action,
      reviewed: current,
      current,
      latest: { ...schedule, version: 3 },
    }),
  ).toBe(true);
  expect(categoryScheduleStale({ action, reviewed: current, current })).toBe(true);
});
it.each(['RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'DEAD'] satisfies ScheduledActionStatus[])(
  'refuses edit/cancel on %s schedules',
  (status) => {
    expect(
      categoryScheduleAllowed({ kind: 'edit', schedule: { ...schedule, status } }, current),
    ).toBe(false);
    expect(
      categoryScheduleAllowed({ kind: 'cancel', schedule: { ...schedule, status } }, current),
    ).toBe(false);
  },
);
it('limits pending edits to creator and permits manager cancellation; archive blocks every mutation', () => {
  const another = { ...schedule, createdByYou: false };
  expect(categoryScheduleAllowed({ kind: 'edit', schedule: another }, current)).toBe(false);
  expect(categoryScheduleAllowed({ kind: 'cancel', schedule: another }, current)).toBe(true);
  expect(categoryScheduleAllowed({ kind: 'create' }, { ...current, eventStatus: 'ARCHIVED' })).toBe(
    false,
  );
  expect(
    categoryScheduleAllowed({ kind: 'cancel', schedule }, { ...current, eventStatus: 'ARCHIVED' }),
  ).toBe(false);
});
it('retains strict create/update/cancel payloads and explicitly refuses category version fields', () => {
  const body = {
    ...categoryScheduleBody({
      action: { kind: 'create' },
      current,
      fields,
      timezone: 'Asia/Singapore',
    }),
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
  };
  expect(categoryScheduleAttempt({ kind: 'create' }, 'category', body).body).toMatchObject({
    expectedActive: true,
  });
  expect(() =>
    categoryScheduleAttempt({ kind: 'create' }, 'category', { ...body, expectedVersion: 1 }),
  ).toThrow();
});
it.each([
  new Error('lost response'),
  new ApiError(429, { code: 'HTTP_429', message: 'rate limited', requestId: 'test' }),
  new ApiError(503, { code: 'SERVER_ERROR', message: 'unavailable', requestId: 'test' }),
  new ApiError(409, { code: 'IDEMPOTENCY_IN_PROGRESS', message: 'pending', requestId: 'test' }),
])('keeps uncertain outcomes retryable with their original request', (error) => {
  expect(categoryScheduleFailure(error)).toMatchObject({
    uncertain: true,
    denied: false,
    blocked: false,
  });
});
it('distinguishes access loss from stale review conflict', () => {
  expect(
    categoryScheduleFailure(
      new ApiError(403, { code: 'FORBIDDEN', message: 'denied', requestId: 'test' }),
    ),
  ).toMatchObject({ denied: true, uncertain: false });
  expect(
    categoryScheduleFailure(
      new ApiError(409, { code: 'VERSION_CONFLICT', message: 'stale', requestId: 'test' }),
    ),
  ).toMatchObject({ blocked: true, uncertain: false });
});
