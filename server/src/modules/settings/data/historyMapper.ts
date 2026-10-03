import {
  EventSettingHistoryRecord,
  EventSettingKey,
  EventSettings,
  GENERATED_SETTING_DEFAULTS,
} from '@spoh/shared';
import type { EventSettingHistoryRow } from './historyRepo.js';

/** Invalid legacy values are omitted, never forwarded as an arbitrary JSON blob. */
export function toEventSettingHistory(row: EventSettingHistoryRow, personId: string) {
  const key = EventSettingKey.parse(row.key);
  const schema = EventSettings.shape[key];
  const before = schema.safeParse(row.before);
  // A reset's effective result is the registry default, while its source stays RESET.
  const after = schema.safeParse(
    row.source === 'RESET' ? GENERATED_SETTING_DEFAULTS[key] : row.after,
  );
  return EventSettingHistoryRecord.parse({
    id: row.id,
    eventId: row.eventId,
    key,
    version: row.version,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    createdByYou: row.actorPersonId === personId,
    reason: row.reason?.slice(0, 500) ?? null,
    values: after.success
      ? { available: true, before: before.success ? before.data : null, after: after.data }
      : { available: false },
  });
}
