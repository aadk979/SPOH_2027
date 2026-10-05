import type {
  ScopedOperationalSetting,
  ScopedOperationalSettingKey,
  ScopedSettingsReadResponse,
} from '@spoh/shared';

export function scopedSettingRow(
  current: ScopedSettingsReadResponse,
  key: ScopedOperationalSettingKey,
) {
  const row = current.data.find((row) => row.key === key);
  if (!row) throw new Error('Scoped setting is unavailable');
  return row;
}
export function scopedSettingReviewChanged(
  a: ScopedOperationalSetting,
  b: ScopedOperationalSetting,
) {
  return (
    a.storedVersion !== b.storedVersion ||
    a.value !== b.value ||
    a.source.scope !== b.source.scope ||
    a.source.version !== b.source.version
  );
}
