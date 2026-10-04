import type { EventSettingHistoryRecord, EventSettings, SettingChangeSource } from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';

export const productSettingLabels = {
  'product.countsMode': 'Counts',
  'product.visitorDataMode': 'Visitor personal data',
} as const;
export const settingSourceLabels: Record<SettingChangeSource, string> = {
  USER: 'Changed by a person',
  SCHEDULE: 'Scheduled change',
  REVERT: 'Restored from history',
  RESET: 'Reset to default',
  CLONE: 'Copied from an event',
  MIGRATION: 'Migrated setting',
};
export function productValueLabel(
  value: EventSettings[keyof EventSettings] | null,
  stations: ReadonlyArray<{ id: string; name: string }> = [],
): string {
  if (value === null) return 'Previous value unavailable';
  if (value === 'none') return 'No visitor personal data';
  if (value === 'allowlist') return 'Only declared visitor fields';
  if (value.mode === 'separate') return 'Three counts, side by side';
  if (value.source.count === 'registrations') return 'Headline from registrations';
  if (value.source.count === 'journeys') return 'Headline from Mission Card journeys';
  const stationId = value.source.stationId;
  const name = stations.find(({ id }) => id === stationId)?.name;
  return name ? `Headline from entries at ${name}` : 'Headline from an unavailable station';
}
export function productRevertWarning(row: EventSettingHistoryRecord) {
  if (row.key !== 'product.visitorDataMode' || !row.values.available) return null;
  return row.values.after === 'none'
    ? 'Restoring none permanently deletes any visitor personal records. Registration counts stay. Deleted records cannot be recovered by another revert.'
    : 'Restoring declared fields enables visitor personal data collection. This is allowed only before the event goes live.';
}
export function productRevertError(error: unknown) {
  if (!(error instanceof ApiError))
    return 'The outcome is unavailable. Retry the same review to check it safely.';
  if (error.status === 401 || error.status === 403)
    return 'Setting history access is unavailable. Reload your session.';
  if (error.status === 404)
    return 'This historical target is unavailable. Reload history before choosing again.';
  if (error.code === 'SETTING_VERSION_CONFLICT')
    return 'This setting changed after your review. Review current values before restoring it.';
  if (error.code === 'SETTING_LOCKED')
    return 'The event state prevents this change. Reload before reviewing again.';
  if (error.code === 'IDEMPOTENCY_IN_PROGRESS')
    return 'The same request is still processing. Retry this review shortly.';
  return 'The setting could not be restored. Reload the current values before reviewing again.';
}
