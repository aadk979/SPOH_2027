import { GENERATED_SETTING_SCHEMAS, ScopedSettingsHistoryRecord } from '@spoh/shared';
import type { ScopedHistoryRow } from './scopedHistoryRepo.js';

/** Validate every historical value; a RESET describes removal, not a guessed inherited result. */
export function toScopedHistory(row: ScopedHistoryRow, personId: string) {
  const key = ScopedSettingsHistoryRecord.shape.key.parse(row.key);
  const schema = GENERATED_SETTING_SCHEMAS[key];
  const before = schema.safeParse(row.before);
  const after = schema.safeParse(row.after);
  const previous = before.success ? before.data : null;
  const values =
    row.source === 'RESET'
      ? { available: true, operation: 'reset', before: previous }
      : after.success
        ? { available: true, operation: 'set', before: previous, after: after.data }
        : { available: false };
  return ScopedSettingsHistoryRecord.parse({
    id: row.id,
    key,
    version: row.version,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    createdByYou: row.actorPersonId === personId,
    reason: row.reason?.slice(0, 500) ?? null,
    values,
  });
}
