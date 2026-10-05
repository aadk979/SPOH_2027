import type { ScopedSettingsMutationRequest, ScopedSettingsRevertRequest } from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';

export type ScopedSettingRequest =
  | { kind: 'change'; body: ScopedSettingsMutationRequest }
  | { kind: 'restore'; body: ScopedSettingsRevertRequest };

export function scopedSettingFailure(failure: unknown, subject: string) {
  const api = failure instanceof ApiError ? failure : null;
  const uncertain =
    !api || api.status >= 500 || api.status === 429 || api.code === 'IDEMPOTENCY_IN_PROGRESS';
  const denied = !!api && [401, 403].includes(api.status);
  const message = denied
    ? `${subject} access is unavailable. Reload your session.`
    : uncertain
      ? 'The outcome is unavailable. Retry the same change to check it safely.'
      : api.code === 'SETTING_VERSION_CONFLICT'
        ? `${subject} changed after your review. Review current values again.`
        : 'This change is unavailable. Reload current values before reviewing again.';
  return { uncertain, denied, blocked: !uncertain && !denied, error: message };
}
