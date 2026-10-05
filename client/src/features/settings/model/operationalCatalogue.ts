import {
  GENERATED_SETTING_METADATA as metadata,
  type ScopedOperationalSetting,
  type ScopedOperationalSettingKey,
  type ScopedSettingsReadResponse,
} from '@spoh/shared';

export function catalogueValue(
  key: ScopedOperationalSettingKey,
  value: ScopedOperationalSetting['value'] | null,
): string {
  if (value === null) return 'Previous value unavailable';
  if (key === 'capture.open') return value ? 'Open' : 'Paused';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None';
  if (typeof value === 'string') return value;
  return `${value}${metadata[key].unit ? ` ${metadata[key].unit}` : ''}`;
}

export function catalogueGroups(current: ScopedSettingsReadResponse) {
  const groups = new Map<string, ScopedOperationalSetting[]>();
  for (const row of current.data) {
    const group = metadata[row.key].group;
    groups.set(group, [...(groups.get(group) ?? []), row]);
  }
  return Array.from(groups, ([title, rows]) => ({ title, rows }));
}
