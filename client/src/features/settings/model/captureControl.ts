import {
  GENERATED_SETTING_METADATA,
  ScopedSettingsMutationRequest,
  ScopedSettingsRevertRequest,
  type ScopedOperationalSetting,
  type ScopedSettingsReadResponse,
  type ScopedSettingsHistoryRecord,
} from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';
import { scopedSettingRow, scopedSettingReviewChanged } from '@/shared/lib/scopedSettingReview';

export const CAPTURE_KEY = 'capture.open';
export const captureMetadata = GENERATED_SETTING_METADATA[CAPTURE_KEY];
export type CaptureAction =
  | { operation: 'set'; value: boolean }
  | { operation: 'reset' }
  | { operation: 'restore'; history: ScopedSettingsHistoryRecord };
export type CaptureRequest =
  | { kind: 'change'; body: ScopedSettingsMutationRequest }
  | { kind: 'restore'; body: ScopedSettingsRevertRequest };
export function captureRow(current: ScopedSettingsReadResponse) {
  return scopedSettingRow(current, CAPTURE_KEY);
}
export function captureValue(value: unknown) {
  return value === true ? 'Open' : value === false ? 'Paused' : 'Previous value unavailable';
}
export function captureSource(row: ScopedOperationalSetting, scope: 'event' | 'station') {
  if (row.source.scope === scope) return `Override at this ${scope}`;
  if (row.source.scope === 'default') return 'Inherited from the registered default';
  return `Inherited from ${row.source.scope} settings`;
}
export function captureActionLabel(action: CaptureAction) {
  if (action.operation === 'set') return action.value ? 'Open capture' : 'Pause capture';
  if (action.operation === 'reset') return 'Remove this override';
  return `Restore historical version ${action.history.version}`;
}
export function captureReviewChanged(a: ScopedOperationalSetting, b: ScopedOperationalSetting) {
  return scopedSettingReviewChanged(a, b);
}
export function captureReviewBlocked(input: {
  current: ScopedSettingsReadResponse;
  action: CaptureAction;
  stale: boolean;
  readUnavailable: boolean;
}) {
  if (input.stale || input.readUnavailable || input.current.eventStatus === 'ARCHIVED') return true;
  if (input.action.operation === 'reset') return captureRow(input.current).storedVersion === 0;
  if (input.action.operation !== 'restore') return false;
  const values = input.action.history.values;
  return (
    !values.available ||
    (values.operation === 'reset' && captureRow(input.current).storedVersion === 0)
  );
}
export function captureReviewBody(input: {
  current: ScopedSettingsReadResponse;
  action: CaptureAction;
  reason: string;
}) {
  const common = {
    target: input.current.target,
    key: CAPTURE_KEY,
    expectedVersion: captureRow(input.current).storedVersion,
    reason: input.reason.trim(),
  };
  const action = input.action;
  return action.operation === 'restore'
    ? { ...common, historyId: action.history.id }
    : { ...common, ...action };
}
export function captureReviewSchema(action: CaptureAction) {
  return action.operation === 'restore'
    ? ScopedSettingsRevertRequest
    : ScopedSettingsMutationRequest;
}
export function captureFailure(failure: unknown) {
  const api = failure instanceof ApiError ? failure : null;
  const uncertain =
    !api || api.status >= 500 || api.status === 429 || api.code === 'IDEMPOTENCY_IN_PROGRESS';
  const denied = !!api && [401, 403].includes(api.status);
  const message = denied
    ? 'Capture settings access is unavailable. Reload your session.'
    : uncertain
      ? 'The outcome is unavailable. Retry the same change to check it safely.'
      : api.code === 'SETTING_VERSION_CONFLICT'
        ? 'Capture settings changed after your review. Review current values again.'
        : 'This change is unavailable. Reload current values before reviewing again.';
  return { uncertain, denied, blocked: !uncertain && !denied, error: message };
}
