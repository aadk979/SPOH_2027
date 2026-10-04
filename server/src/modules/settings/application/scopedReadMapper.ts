import {
  ScopedOperationalSetting,
  type ScopedOperationalSettingKey,
  type SettingReadScope,
} from '@spoh/shared';
import { resolveSetting, type SettingLayer } from '../../../platform/settings/resolve.js';
import type { ScopedSettingRows } from '../data/scopedReadRepo.js';

/** Only validated registered values leave the resolver; malformed stored JSON stays private. */
export function toScopedSetting(
  key: ScopedOperationalSettingKey,
  rows: ScopedSettingRows,
  scope: SettingReadScope,
): ScopedOperationalSetting {
  const layers: SettingLayer[] = [];
  for (const layer of ['platform', 'event', 'station'] as const) {
    const row = rows[layer].find((stored) => stored.key === key);
    if (row) layers.push({ scope: layer, value: row.value, version: row.version });
  }
  const resolved = resolveSetting(key, layers);
  return ScopedOperationalSetting.parse({
    key,
    value: resolved.value,
    source: { scope: resolved.source, version: resolved.version },
    storedVersion: rows[scope].find((row) => row.key === key)?.version ?? 0,
    invalidScopes: resolved.invalidScopes,
  });
}
