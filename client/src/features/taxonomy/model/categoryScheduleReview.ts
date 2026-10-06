import {
  CreateCategoryScheduleRequest,
  UpdateCategoryScheduleRequest,
  CancelCategoryScheduleRequest,
  IsoDate,
  wallTimeToInstant,
  zonedWallTime,
  type CategoryActivityResponse,
  type CategoryScheduleRecord,
} from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';

export type CategoryScheduleAction =
  { kind: 'create' } | { kind: 'edit' | 'cancel'; schedule: CategoryScheduleRecord };
export type CategoryScheduleAttempt =
  | { kind: 'create'; categoryId: string; body: CreateCategoryScheduleRequest }
  | { kind: 'edit'; categoryId: string; id: string; body: UpdateCategoryScheduleRequest }
  | { kind: 'cancel'; categoryId: string; id: string; body: CancelCategoryScheduleRequest };
export type CategoryScheduleFields = {
  active: 'active' | 'inactive';
  wallTime: string;
  reason: string;
};
export function categoryScheduleSchema(action: CategoryScheduleAction) {
  return action.kind === 'create'
    ? CreateCategoryScheduleRequest
    : action.kind === 'edit'
      ? UpdateCategoryScheduleRequest
      : CancelCategoryScheduleRequest;
}
export function categoryScheduleInstant(wallTime: string, timezone: string) {
  const [date, time, extra] = wallTime.split('T');
  if (
    !timezone ||
    extra !== undefined ||
    !IsoDate.safeParse(date).success ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time ?? '')
  )
    throw new Error('Choose a valid date and time on the event clock.');
  return wallTimeToInstant(date!, time!, timezone).toISOString();
}
export function categoryScheduleFields(
  action: CategoryScheduleAction,
  current: CategoryActivityResponse,
  timezone: string,
): CategoryScheduleFields {
  return {
    active: (action.kind === 'create' ? !current.data.active : action.schedule.active)
      ? 'active'
      : 'inactive',
    reason: '',
    wallTime: zonedWallTime(
      new Date(
        action.kind === 'create'
          ? Date.parse(current.evaluatedAt) + 300_000
          : action.schedule.scheduledFor,
      ),
      timezone,
    ),
  };
}
export function categoryScheduleBody(input: {
  action: CategoryScheduleAction;
  current: CategoryActivityResponse;
  fields: CategoryScheduleFields;
  timezone: string;
}) {
  const reason = input.fields.reason.trim();
  if (input.action.kind === 'cancel')
    return { expectedScheduleVersion: input.action.schedule.version, reason };
  const runAt = categoryScheduleInstant(input.fields.wallTime, input.timezone);
  if (Date.parse(runAt) <= Date.now()) throw new Error('Choose a future time on the event clock.');
  const intent = {
    active: input.fields.active === 'active',
    runAt,
    reason,
    expectedActive: input.current.data.active,
    expectedUpdatedAt: input.current.data.updatedAt,
  };
  return input.action.kind === 'create'
    ? intent
    : { ...intent, expectedScheduleVersion: input.action.schedule.version };
}
export function categoryScheduleAttempt(
  action: CategoryScheduleAction,
  categoryId: string,
  body: unknown,
): CategoryScheduleAttempt {
  if (action.kind === 'create')
    return { kind: 'create', categoryId, body: CreateCategoryScheduleRequest.parse(body) };
  const target = { categoryId, id: action.schedule.id };
  return action.kind === 'edit'
    ? { kind: 'edit', ...target, body: UpdateCategoryScheduleRequest.parse(body) }
    : { kind: 'cancel', ...target, body: CancelCategoryScheduleRequest.parse(body) };
}
export function categoryScheduleStale(input: {
  action: CategoryScheduleAction;
  reviewed: CategoryActivityResponse;
  current: CategoryActivityResponse;
  latest?: CategoryScheduleRecord;
}) {
  return (
    input.reviewed.eventId !== input.current.eventId ||
    input.reviewed.data.id !== input.current.data.id ||
    (input.action.kind !== 'cancel' &&
      (input.reviewed.data.active !== input.current.data.active ||
        input.reviewed.data.updatedAt !== input.current.data.updatedAt)) ||
    (input.action.kind !== 'create' &&
      (!input.latest ||
        input.latest.version !== input.action.schedule.version ||
        input.latest.status !== input.action.schedule.status))
  );
}
export function categoryScheduleAllowed(
  action: CategoryScheduleAction,
  current: CategoryActivityResponse,
) {
  return (
    current.eventStatus !== 'ARCHIVED' &&
    (action.kind === 'create' ||
      (action.schedule.status === 'PENDING' &&
        (action.kind === 'cancel' || action.schedule.createdByYou)))
  );
}
export function categoryScheduleFailure(error: unknown) {
  const api = error instanceof ApiError ? error : null;
  const denied = !!api && [401, 403].includes(api.status);
  const uncertain =
    !api || api.status >= 500 || api.status === 429 || api.code === 'IDEMPOTENCY_IN_PROGRESS';
  return {
    denied,
    uncertain,
    blocked: !denied && !uncertain,
    error: denied
      ? 'Category schedules access is unavailable. Reload your session.'
      : uncertain
        ? 'The outcome is unavailable. Retry the same schedule request to check it safely.'
        : 'The category or schedule changed, or this request is unavailable. Review current state again.',
  };
}
