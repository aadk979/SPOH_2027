import {
  GENERATED_SETTING_METADATA as metadata,
  type ScopedOperationalSettingKey,
} from '@spoh/shared';

export function settingScheduleCopy(key: ScopedOperationalSettingKey = 'capture.open') {
  const capture = key === 'capture.open';
  return {
    label: capture ? 'Capture' : metadata[key].label,
    noun: capture ? 'capture' : 'setting',
    title: capture ? 'Capture schedules' : `${metadata[key].label} schedules`,
  };
}

export function scheduledSettingValue(key: ScopedOperationalSettingKey, value: unknown) {
  if (key === 'capture.open') return value === true ? 'Open' : 'Paused';
  return Array.isArray(value) ? value.join(', ') || 'None' : String(value);
}
