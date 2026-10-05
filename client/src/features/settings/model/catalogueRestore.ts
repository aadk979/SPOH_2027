import type { ScopedSettingsHistoryRecord, ScopedSettingsReadResponse } from '@spoh/shared';
import { scopedSettingRow } from '@/shared/lib/scopedSettingReview';
import { scopedSettingFailure } from './scopedSettingChange';

export function catalogueRestoreBlocked(input: {
  current: ScopedSettingsReadResponse;
  history: ScopedSettingsHistoryRecord;
  stale: boolean;
  readUnavailable: boolean;
}) {
  if (input.stale || input.readUnavailable || input.current.eventStatus === 'ARCHIVED') return true;
  const values = input.history.values;
  return (
    !values.available ||
    (values.operation === 'reset' &&
      scopedSettingRow(input.current, input.history.key).storedVersion === 0)
  );
}
export function catalogueRestoreBody(input: {
  current: ScopedSettingsReadResponse;
  history: ScopedSettingsHistoryRecord;
  reason: string;
}) {
  return {
    target: input.current.target,
    key: input.history.key,
    historyId: input.history.id,
    expectedVersion: scopedSettingRow(input.current, input.history.key).storedVersion,
    reason: input.reason.trim(),
  };
}
export function catalogueRestoreFailure(failure: unknown) {
  return scopedSettingFailure(failure, 'Catalogue settings');
}
