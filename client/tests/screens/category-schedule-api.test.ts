import { beforeEach, expect, it, vi } from 'vitest';
import type { CategoryActivityResponse, CategoryScheduleRecord } from '@spoh/shared';
import { api } from '@/shared/lib/api';
import {
  cancelCategorySchedule,
  createCategorySchedule,
  getCategoryActivity,
  getCategorySchedule,
  listCategoryActivity,
  listCategorySchedules,
  updateCategorySchedule,
} from '@/features/taxonomy/api';

vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const current: CategoryActivityResponse = {
  eventId: 'event',
  eventStatus: 'LIVE',
  evaluatedAt: '2027-01-01T03:00:00Z',
  data: {
    id: 'category/one',
    code: 'CRAFT',
    label: 'Craft',
    sortOrder: 1,
    active: false,
    updatedAt: '2027-01-01T02:00:00Z',
  },
};
const schedule: CategoryScheduleRecord = {
  id: 'action/one',
  eventId: 'event',
  categoryId: current.data.id,
  kind: 'CAPTURE_CATEGORY',
  recurring: false,
  active: true,
  expectedActive: false,
  expectedUpdatedAt: current.data.updatedAt,
  reason: 'Reviewed activation',
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
const intent = {
  active: true,
  expectedActive: false,
  expectedUpdatedAt: '2027-01-01T10:00:00+08:00',
  reason: 'Reviewed activation',
  runAt: '2027-01-01T13:00:00+08:00',
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
};
beforeEach(() => {
  mockedApi.mockReset();
});

it('reads inactive categories using bounded cursor pages and no browser caching', async () => {
  const page = {
    eventId: current.eventId,
    eventStatus: current.eventStatus,
    evaluatedAt: current.evaluatedAt,
    data: [current.data],
    meta: { count: 1, nextCursor: 'next+' },
  };
  mockedApi.mockResolvedValue(page);
  expect(await listCategoryActivity('event', 'prior+')).toEqual(page);
  expect(mockedApi).toHaveBeenCalledWith(
    '/events/event/admin/capture-categories?limit=20&cursor=prior%2B',
    { cache: 'no-store' },
  );
});
it('reads current category and individual schedule with encoded identifiers', async () => {
  mockedApi.mockResolvedValueOnce(current).mockResolvedValueOnce({ schedule, current });
  await getCategoryActivity('event', current.data.id);
  await getCategorySchedule('event', { categoryId: current.data.id, id: schedule.id });
  expect(mockedApi.mock.calls.map(([path]) => path)).toEqual([
    '/events/event/admin/capture-categories/category%2Fone',
    '/events/event/admin/capture-categories/category%2Fone/schedules/action%2Fone',
  ]);
  expect(mockedApi.mock.calls.every(([, options]) => options?.cache === 'no-store')).toBe(true);
});
it('preserves all-status reads and supports terminal-state pagination', async () => {
  mockedApi.mockResolvedValue({
    eventId: 'event',
    categoryId: current.data.id,
    evaluatedAt: current.evaluatedAt,
    data: [{ ...schedule, status: 'DEAD' }],
    meta: { count: 1, nextCursor: null },
  });
  await listCategorySchedules('event', { categoryId: current.data.id });
  await listCategorySchedules('event', {
    categoryId: current.data.id,
    status: 'DEAD',
    cursor: 'next+',
  });
  expect(mockedApi.mock.calls[0]?.[0]).toBe(
    '/events/event/admin/capture-categories/category%2Fone/schedules?limit=20',
  );
  expect(mockedApi.mock.calls[1]?.[0]).toBe(
    '/events/event/admin/capture-categories/category%2Fone/schedules?limit=20&status=DEAD&cursor=next%2B',
  );
});
it('normalizes create/update instants but preserves snapshot and idempotency intent', async () => {
  mockedApi.mockResolvedValue({ schedule, current });
  await createCategorySchedule('event', { categoryId: current.data.id, body: intent });
  await updateCategorySchedule('event', {
    categoryId: current.data.id,
    id: schedule.id,
    body: { ...intent, expectedScheduleVersion: 2 },
  });
  const normalized = {
    ...intent,
    expectedUpdatedAt: '2027-01-01T02:00:00.000Z',
    runAt: '2027-01-01T05:00:00.000Z',
  };
  expect(mockedApi.mock.calls[0]?.[1]).toEqual({
    method: 'POST',
    body: normalized,
    cache: 'no-store',
  });
  expect(mockedApi.mock.calls[1]?.[1]).toEqual({
    method: 'PATCH',
    body: { ...normalized, expectedScheduleVersion: 2 },
    cache: 'no-store',
  });
});
it('cancels through the selected schedule version without inventing category revision', async () => {
  mockedApi.mockResolvedValue({ schedule: { ...schedule, status: 'CANCELLED' }, current });
  const body = {
    expectedScheduleVersion: 2,
    reason: 'Reviewed cancellation',
    idempotencyKey: intent.idempotencyKey,
  };
  await cancelCategorySchedule('event', { categoryId: current.data.id, id: schedule.id, body });
  expect(mockedApi).toHaveBeenCalledWith(
    '/events/event/admin/capture-categories/category%2Fone/schedules/action%2Fone/cancel',
    { method: 'POST', body, cache: 'no-store' },
  );
});
it.each(['event', 'category', 'action'])(
  'rejects a mismatched %s before displaying private response',
  async (mismatch) => {
    const wrongCurrent =
      mismatch === 'event'
        ? { ...current, eventId: 'foreign' }
        : mismatch === 'category'
          ? { ...current, data: { ...current.data, id: 'foreign' } }
          : current;
    const wrongSchedule = {
      ...schedule,
      eventId: wrongCurrent.eventId,
      categoryId: wrongCurrent.data.id,
      id: mismatch === 'action' ? 'foreign' : schedule.id,
    };
    mockedApi.mockResolvedValue({ current: wrongCurrent, schedule: wrongSchedule });
    await expect(
      getCategorySchedule('event', { categoryId: current.data.id, id: schedule.id }),
    ).rejects.toThrow('mismatch');
  },
);
it('rejects duplicate/list target/count inconsistencies', async () => {
  mockedApi.mockResolvedValue({
    eventId: 'event',
    categoryId: current.data.id,
    evaluatedAt: current.evaluatedAt,
    data: [schedule, schedule],
    meta: { count: 2, nextCursor: null },
  });
  await expect(listCategorySchedules('event', { categoryId: current.data.id })).rejects.toThrow();
});
it('refuses unknown revision data and malformed versions before issuing writes', async () => {
  const unknownRevision = { ...intent, expectedVersion: 0 };
  await expect(
    createCategorySchedule('event', { categoryId: current.data.id, body: unknownRevision }),
  ).rejects.toThrow();
  await expect(
    updateCategorySchedule('event', {
      categoryId: current.data.id,
      id: schedule.id,
      body: { ...intent, expectedScheduleVersion: 0 },
    }),
  ).rejects.toThrow();
  expect(mockedApi).not.toHaveBeenCalled();
});
