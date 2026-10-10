import { z } from 'zod';
import { SETTINGS, type SettingKey } from '../../../platform/settings/registry.js';

const KEYS = [
  'alertPollSeconds',
  'push.ttlSeconds.lostPerson',
  'push.ttlSeconds.incident',
  'push.ttlSeconds.announcement',
  'incident.pushSeverities',
] as const satisfies readonly SettingKey[];
const Rows = z.array(z.object({ key: z.enum(KEYS), value: z.unknown() }).strict());

/** Polling is the guaranteed transport; optional push does not claim device delivery. */
export function notificationReadinessFacts(value: unknown) {
  const parsed = Rows.safeParse(value);
  if (!parsed.success) return undefined;
  const rows = new Map(parsed.data.map((row) => [row.key, row.value]));
  if (rows.size !== parsed.data.length) return undefined;
  const valid = KEYS.every(
    (key) =>
      SETTINGS[key].schema.safeParse(rows.has(key) ? rows.get(key) : SETTINGS[key].default).success,
  );
  return { transportConfigured: valid, settingsValid: valid };
}
