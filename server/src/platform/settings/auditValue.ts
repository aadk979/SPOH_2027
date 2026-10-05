import { SETTINGS, type SettingKey } from './registry.js';

/** A key's operational label cannot declassify malformed legacy JSON. */
export function settingAuditValue(key: SettingKey, value: unknown): unknown {
  const definition = SETTINGS[key];
  if (definition.class !== 'operational') return '[redacted]';
  const parsed = definition.schema.safeParse(value);
  return parsed.success ? parsed.data : '[invalid stored value]';
}
