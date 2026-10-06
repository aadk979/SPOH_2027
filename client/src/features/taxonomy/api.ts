import {
  CategoryActivityListQuery,
  CategoryActivityListResponse,
  CategoryActivityResponse,
  CategoryScheduleListQuery,
  CategoryScheduleListResponse,
  CategoryScheduleResponse,
  CreateCategoryScheduleRequest,
  UpdateCategoryScheduleRequest,
  CancelCategoryScheduleRequest,
  type ScheduledActionStatus,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

const categoryPath = (categoryId: string) =>
  `/admin/capture-categories/${encodeURIComponent(categoryId)}`;
function assertCategory(eventId: string, categoryId: string, current: CategoryActivityResponse) {
  if (current.eventId !== eventId || current.data.id !== categoryId)
    throw new Error('Category event or target mismatch');
}
function scheduleResponse(
  eventId: string,
  input: { categoryId: string; id?: string },
  result: unknown,
) {
  const response = CategoryScheduleResponse.parse(result);
  assertCategory(eventId, input.categoryId, response.current);
  if (input.id && response.schedule.id !== input.id)
    throw new Error('Category schedule action mismatch');
  return response;
}
export async function listCategoryActivity(eventId: string, cursor?: string) {
  const query = CategoryActivityListQuery.parse({ cursor, limit: 20 });
  const params = new URLSearchParams({ limit: String(query.limit) });
  if (query.cursor) params.set('cursor', query.cursor);
  const page = CategoryActivityListResponse.parse(
    await eventApi(eventId, `/admin/capture-categories?${params}`, { cache: 'no-store' }),
  );
  if (page.eventId !== eventId) throw new Error('Category list event mismatch');
  return page;
}
export async function getCategoryActivity(eventId: string, categoryId: string) {
  const current = CategoryActivityResponse.parse(
    await eventApi(eventId, categoryPath(categoryId), { cache: 'no-store' }),
  );
  assertCategory(eventId, categoryId, current);
  return current;
}
export async function listCategorySchedules(
  eventId: string,
  input: { categoryId: string; status?: ScheduledActionStatus; cursor?: string },
) {
  const query = CategoryScheduleListQuery.parse({
    status: input.status,
    cursor: input.cursor,
    limit: 20,
  });
  const params = new URLSearchParams({ limit: String(query.limit) });
  if (query.status) params.set('status', query.status);
  if (query.cursor) params.set('cursor', query.cursor);
  const page = CategoryScheduleListResponse.parse(
    await eventApi(eventId, `${categoryPath(input.categoryId)}/schedules?${params}`, {
      cache: 'no-store',
    }),
  );
  if (page.eventId !== eventId || page.categoryId !== input.categoryId)
    throw new Error('Category schedules target mismatch');
  return page;
}
export async function getCategorySchedule(
  eventId: string,
  input: { categoryId: string; id: string },
) {
  return scheduleResponse(
    eventId,
    input,
    await eventApi(
      eventId,
      `${categoryPath(input.categoryId)}/schedules/${encodeURIComponent(input.id)}`,
      { cache: 'no-store' },
    ),
  );
}
export async function createCategorySchedule(
  eventId: string,
  input: { categoryId: string; body: CreateCategoryScheduleRequest },
) {
  const body = CreateCategoryScheduleRequest.parse(input.body);
  return scheduleResponse(
    eventId,
    input,
    await eventApi(eventId, `${categoryPath(input.categoryId)}/schedules`, {
      method: 'POST',
      body,
      cache: 'no-store',
    }),
  );
}
export async function updateCategorySchedule(
  eventId: string,
  input: { categoryId: string; id: string; body: UpdateCategoryScheduleRequest },
) {
  const body = UpdateCategoryScheduleRequest.parse(input.body);
  return scheduleResponse(
    eventId,
    input,
    await eventApi(
      eventId,
      `${categoryPath(input.categoryId)}/schedules/${encodeURIComponent(input.id)}`,
      { method: 'PATCH', body, cache: 'no-store' },
    ),
  );
}
export async function cancelCategorySchedule(
  eventId: string,
  input: { categoryId: string; id: string; body: CancelCategoryScheduleRequest },
) {
  const body = CancelCategoryScheduleRequest.parse(input.body);
  return scheduleResponse(
    eventId,
    input,
    await eventApi(
      eventId,
      `${categoryPath(input.categoryId)}/schedules/${encodeURIComponent(input.id)}/cancel`,
      { method: 'POST', body, cache: 'no-store' },
    ),
  );
}
