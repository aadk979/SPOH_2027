import type { SettingKey, SettingScope } from './registry.js';
import { SETTINGS } from './registry.js';

export interface SettingLayer {
  scope: SettingScope;
  value: unknown;
  version: number;
}

export interface ResolvedSetting {
  key: SettingKey;
  value: unknown;
  source: SettingScope | 'default';
  version: number;
  invalidScopes: SettingScope[];
}

const PRECEDENCE: readonly SettingScope[] = ['station', 'event', 'platform'];

/** Resolve only scopes permitted by the registry; malformed rows fall through. */
export function resolveSetting(key: SettingKey, layers: readonly SettingLayer[]): ResolvedSetting {
  const definition = SETTINGS[key];
  const invalidScopes: SettingScope[] = [];
  for (const scope of PRECEDENCE) {
    if (!definition.scopes.includes(scope)) continue;
    const row = layers.find((layer) => layer.scope === scope);
    if (!row) continue;
    const parsed = definition.schema.safeParse(row.value);
    if (parsed.success) {
      return { key, value: parsed.data, source: scope, version: row.version, invalidScopes };
    }
    invalidScopes.push(scope);
  }
  return { key, value: definition.default, source: 'default', version: 0, invalidScopes };
}
