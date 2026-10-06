import { describe, expect, it } from 'vitest';
import {
  CategoryActivityListQuery,
  CategoryActivityListResponse,
  CategoryActivityRecord,
  CategoryActivityResponse,
  CategoryScheduleCreationIntent,
  CategoryScheduleListQuery,
  CategoryScheduleListResponse,
  CategoryScheduleRecord,
  CategoryScheduleResponse,
  CreateCategoryScheduleRequest,
  UpdateCategoryScheduleRequest,
  CancelCategoryScheduleRequest,
} from './index.js';

const category = {
  id: 'category-one',
  code: 'VISITOR',
  label: 'Visitors',
  sortOrder: 2,
  active: false,
  updatedAt: '2027-01-07T03:00:00.000Z',
};
const review = {
  active: true,
  expectedActive: false,
  expectedUpdatedAt: category.updatedAt,
  reason: 'Reviewed restored category',
  runAt: '2027-01-07T04:00:00.000Z',
};
const request = { ...review, idempotencyKey: '00000000-0000-4000-8000-000000000001' };
const current = {
  eventId: 'event-one',
  eventStatus: 'READY',
  evaluatedAt: '2027-01-07T03:30:00.000Z',
  data: category,
};
const schedule = {
  id: 'schedule-one',
  eventId: current.eventId,
  kind: 'CAPTURE_CATEGORY',
  scheduledFor: review.runAt,
  runAt: review.runAt,
  status: 'PENDING',
  version: 1,
  attempts: 0,
  maxAttempts: 5,
  recurring: false,
  createdByYou: true,
  createdAt: current.evaluatedAt,
  completedAt: null,
  lastError: null,
  categoryId: category.id,
  ...review,
};
// Review.runAt belongs to the intent; the status record independently carries retry eligibility.
const record = () => {
  const { runAt: _instant, ...definition } = review;
  return { ...schedule, ...definition };
};

describe('private category activity reads', () => {
  it('includes inactive categories without changing the booth category contract', () => {
    expect(CategoryActivityRecord.parse(category).active).toBe(false);
    expect(CategoryActivityResponse.parse(current).data).toEqual(category);
  });
  it('uses bounded pagination, without coercing category activity from query strings', () => {
    expect(CategoryActivityListQuery.parse({ limit: '20' })).toEqual({ limit: 20 });
    expect(CategoryActivityListQuery.safeParse({ active: 'false' }).success).toBe(false);
    expect(CategoryActivityListQuery.safeParse({ limit: 201 }).success).toBe(false);
  });
  it.each([
    { active: 'false' },
    { updatedAt: 'tomorrow' },
    { personId: 'private-person' },
    { eventId: 'foreign' },
  ])('rejects invalid/private category field %j', (patch) => {
    expect(CategoryActivityRecord.safeParse({ ...category, ...patch }).success).toBe(false);
  });
  it('requires accurate count and unique category identities', () => {
    const list = { ...current, data: [category], meta: { count: 1, nextCursor: null } };
    expect(CategoryActivityListResponse.safeParse(list).success).toBe(true);
    expect(
      CategoryActivityListResponse.safeParse({ ...list, meta: { count: 0, nextCursor: null } })
        .success,
    ).toBe(false);
    expect(
      CategoryActivityListResponse.safeParse({
        ...list,
        data: [category, category],
        meta: { count: 2, nextCursor: null },
      }).success,
    ).toBe(false);
  });
});

describe('reviewed absolute category schedule requests', () => {
  it('keeps the desired state independent from the reviewed current state', () => {
    expect(CreateCategoryScheduleRequest.parse(request)).toMatchObject({
      active: true,
      expectedActive: false,
    });
    expect(
      CategoryScheduleCreationIntent.parse({ ...review, categoryId: category.id }).categoryId,
    ).toBe(category.id);
  });
  it('normalises event-clock offsets and trims reasons for canonical receipt comparison', () => {
    expect(
      CreateCategoryScheduleRequest.parse({
        ...request,
        expectedUpdatedAt: '2027-01-07T11:00:00+08:00',
        runAt: '2027-01-07T12:00:00+08:00',
        reason: '  Reviewed restored category  ',
      }),
    ).toEqual(request);
  });
  it.each([
    { active: 'true' },
    { expectedActive: 0 },
    { expectedUpdatedAt: undefined },
    { expectedUpdatedAt: '2027-01-07' },
    { reason: '  ' },
    { reason: 'x'.repeat(501) },
    { runAt: 'tomorrow' },
    { idempotencyKey: 'same-key' },
  ])('rejects malformed required review field %j', (patch) => {
    expect(CreateCategoryScheduleRequest.safeParse({ ...request, ...patch }).success).toBe(false);
  });
  it.each([
    'categoryId',
    'kind',
    'type',
    'eventId',
    'createdByPersonId',
    'recurrence',
    'dedupeKey',
    'version',
    'attempts',
    'maxAttempts',
    'expectedVersion',
    'expectedCategoryVersion',
  ])('cannot inject %s into a creation', (key) => {
    expect(
      CreateCategoryScheduleRequest.safeParse({ ...request, [key]: 'unavailable' }).success,
    ).toBe(false);
  });
  it('reviews action version separately without inventing a category version', () => {
    expect(
      UpdateCategoryScheduleRequest.parse({ ...request, expectedScheduleVersion: 3 })
        .expectedScheduleVersion,
    ).toBe(3);
    for (const expectedScheduleVersion of [0, -1, 1.5, '1', undefined]) {
      expect(
        UpdateCategoryScheduleRequest.safeParse({ ...request, expectedScheduleVersion }).success,
      ).toBe(false);
    }
  });
  it('cancellation only reviews the action and does not require a category snapshot', () => {
    const cancel = {
      expectedScheduleVersion: 3,
      reason: 'Cancel owned pending work',
      idempotencyKey: request.idempotencyKey,
    };
    expect(CancelCategoryScheduleRequest.parse(cancel)).toEqual(cancel);
    expect(
      CancelCategoryScheduleRequest.safeParse({ ...cancel, expectedUpdatedAt: category.updatedAt })
        .success,
    ).toBe(false);
    expect(CancelCategoryScheduleRequest.safeParse({ ...cancel, active: false }).success).toBe(
      false,
    );
  });
});

describe('bounded category schedule status and collections', () => {
  it('permits retry eligibility to differ from the reviewed original due instant', () => {
    expect(
      CategoryScheduleResponse.parse({
        schedule: { ...record(), runAt: '2027-01-07T04:00:30.000Z', version: 3, attempts: 2 },
        current,
      }).schedule.scheduledFor,
    ).toBe(review.runAt);
  });
  it.each(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED'])(
    'accepts scheduler state %s',
    (status) => {
      expect(CategoryScheduleRecord.safeParse({ ...record(), status }).success).toBe(true);
      expect(CategoryScheduleListQuery.parse({ status, limit: 20 }).status).toBe(status);
    },
  );
  it.each([{ eventId: 'foreign-event' }, { categoryId: 'foreign-category' }])(
    'refuses schedule/current ownership mismatch %j',
    (patch) => {
      expect(
        CategoryScheduleResponse.safeParse({ schedule: { ...record(), ...patch }, current })
          .success,
      ).toBe(false);
    },
  );
  it.each([
    { recurring: true },
    { kind: 'SETTING' },
    { payload: {} },
    { actorId: 'private' },
    { lockedBy: 'worker' },
    { lastError: 'raw secret' },
    { version: 0 },
  ])('rejects unsupported/private status field %j', (patch) => {
    expect(CategoryScheduleRecord.safeParse({ ...record(), ...patch }).success).toBe(false);
  });
  it('binds each page to one event/category with accurate metadata and unique ids', () => {
    const page = {
      eventId: current.eventId,
      categoryId: category.id,
      evaluatedAt: current.evaluatedAt,
      data: [record()],
      meta: { count: 1, nextCursor: null },
    };
    expect(CategoryScheduleListResponse.safeParse(page).success).toBe(true);
    for (const patch of [
      { eventId: 'foreign' },
      { categoryId: 'foreign' },
      { meta: { count: 0, nextCursor: null } },
      { data: [record(), record()], meta: { count: 2, nextCursor: null } },
    ]) {
      expect(CategoryScheduleListResponse.safeParse({ ...page, ...patch }).success).toBe(false);
    }
  });
});
