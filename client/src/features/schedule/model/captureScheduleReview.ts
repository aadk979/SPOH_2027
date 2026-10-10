import {
  CancelCaptureScheduleRequest,
  CreateCaptureScheduleRequest,
  UpdateCaptureScheduleRequest,
  IsoDate,
  wallTimeToInstant,
  zonedWallTime,
  type CaptureScheduleRecord,
  type ScopedSettingsReadResponse,
  type ScopedSettingsTarget,
  type ScopedOperationalSettingKey,
} from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';
import { scopedSettingRow, scopedSettingReviewChanged } from '@/shared/lib/scopedSettingReview';
import {
  catalogueField,
  catalogueInputValue,
  type CatalogueInput,
} from '@/shared/lib/settingField';

export type CaptureScheduleAction =
  | { kind: 'create'; key?: ScopedOperationalSettingKey }
  | { kind: 'edit' | 'cancel'; schedule: CaptureScheduleRecord };
export type CaptureScheduleAttempt =
  | { kind: 'create'; body: CreateCaptureScheduleRequest }
  | { kind: 'edit'; id: string; target: ScopedSettingsTarget; body: UpdateCaptureScheduleRequest }
  | {
      kind: 'cancel';
      id: string;
      target: ScopedSettingsTarget;
      body: CancelCaptureScheduleRequest;
    };
export type CaptureScheduleFields = { value: CatalogueInput; wallTime: string; reason: string };
export const captureScheduleKey = (action: CaptureScheduleAction) =>
  action.kind === 'create' ? (action.key ?? 'capture.open') : action.schedule.key;
export function captureScheduleSchema(action: CaptureScheduleAction) {
  if (action.kind === 'create') return CreateCaptureScheduleRequest;
  return action.kind === 'edit' ? UpdateCaptureScheduleRequest : CancelCaptureScheduleRequest;
}
export function captureScheduleInstant(wallTime: string, timezone: string) {
  const parts = wallTime.split('T');
  if (
    !timezone ||
    parts.length !== 2 ||
    !IsoDate.safeParse(parts[0]).success ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(parts[1] ?? '')
  )
    throw new Error('Choose a valid date and time on the event clock.');
  return wallTimeToInstant(parts[0]!, parts[1]!, timezone).toISOString();
}
export function captureScheduleFields(
  action: CaptureScheduleAction,
  timezone: string,
  current?: ScopedSettingsReadResponse,
): CaptureScheduleFields {
  const key = captureScheduleKey(action);
  const value =
    action.kind === 'create'
      ? current?.data.find((row) => row.key === key)?.value
      : action.schedule.value;
  return {
    value:
      key === 'capture.open'
        ? value === true && action.kind !== 'create'
          ? 'open'
          : 'paused'
        : typeof value === 'number'
          ? String(value)
          : (value ?? ''),
    reason: '',
    wallTime: zonedWallTime(
      new Date(action.kind === 'create' ? Date.now() + 300_000 : action.schedule.scheduledFor),
      timezone,
    ),
  };
}
export function captureScheduleBody(input: {
  action: CaptureScheduleAction;
  current: ScopedSettingsReadResponse;
  fields: CaptureScheduleFields;
  timezone: string;
}) {
  const reason = input.fields.reason.trim();
  if (input.action.kind === 'cancel')
    return { expectedScheduleVersion: input.action.schedule.version, reason };
  const runAt = captureScheduleInstant(input.fields.wallTime, input.timezone);
  if (Date.parse(runAt) <= Date.now()) throw new Error('Choose a future time on the event clock.');
  const editable = {
    value: scheduledValue(captureScheduleKey(input.action), input.fields.value),
    runAt,
    reason,
    expectedVersion: scopedSettingRow(input.current, captureScheduleKey(input.action))
      .storedVersion,
  };
  return input.action.kind === 'create'
    ? { ...editable, target: input.current.target, key: captureScheduleKey(input.action) }
    : { ...editable, expectedScheduleVersion: input.action.schedule.version };
}
export function captureScheduleAttempt(
  action: CaptureScheduleAction,
  current: ScopedSettingsReadResponse,
  body: unknown,
): CaptureScheduleAttempt {
  if (action.kind === 'create')
    return { kind: 'create', body: CreateCaptureScheduleRequest.parse(body) };
  const fixed = { id: action.schedule.id, target: current.target };
  return action.kind === 'edit'
    ? { kind: 'edit', ...fixed, body: UpdateCaptureScheduleRequest.parse(body) }
    : { kind: 'cancel', ...fixed, body: CancelCaptureScheduleRequest.parse(body) };
}
export function captureScheduleReviewStale(input: {
  action: CaptureScheduleAction;
  reviewed: ScopedSettingsReadResponse;
  current: ScopedSettingsReadResponse;
  latest?: CaptureScheduleRecord;
}) {
  const settingChanged =
    input.action.kind !== 'cancel' &&
    scopedSettingReviewChanged(
      scopedSettingRow(input.reviewed, captureScheduleKey(input.action)),
      scopedSettingRow(input.current, captureScheduleKey(input.action)),
    );
  return (
    settingChanged ||
    (input.action.kind !== 'create' &&
      (!input.latest ||
        input.latest.version !== input.action.schedule.version ||
        input.latest.status !== input.action.schedule.status))
  );
}

function scheduledValue(key: ScopedOperationalSettingKey, value: CatalogueInput) {
  if (key === 'capture.open') return value === 'open';
  const field = catalogueField(key);
  return field ? catalogueInputValue(field, value) : value;
}
export function captureScheduleAllowed(
  action: CaptureScheduleAction,
  current: ScopedSettingsReadResponse,
) {
  if (current.eventStatus === 'ARCHIVED') return false;
  return (
    action.kind === 'create' ||
    (action.schedule.status === 'PENDING' &&
      (action.kind === 'cancel' || action.schedule.createdByYou))
  );
}
export function captureScheduleReviewBlocked(input: {
  action: CaptureScheduleAction;
  current: ScopedSettingsReadResponse;
  readUnavailable: boolean;
  stale: boolean;
}) {
  return (
    input.stale || input.readUnavailable || !captureScheduleAllowed(input.action, input.current)
  );
}
export function captureScheduleFailure(error: unknown) {
  const api = error instanceof ApiError ? error : null;
  const denied = !!api && [401, 403].includes(api.status);
  const uncertain =
    !api || api.status >= 500 || api.status === 429 || api.code === 'IDEMPOTENCY_IN_PROGRESS';
  return {
    denied,
    uncertain,
    blocked: !denied && !uncertain,
    error: denied
      ? 'Capture schedules access is unavailable. Reload your session.'
      : uncertain
        ? 'The outcome is unavailable. Retry the same schedule request to check it safely.'
        : 'The schedule or capture value changed, or this request is unavailable. Review current state again.',
  };
}
