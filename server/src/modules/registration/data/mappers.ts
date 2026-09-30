import type { RegistrationRecord } from '@spoh/shared';
import type { RegistrationRow } from './repo.js';

export function toRegistrationRecord(row: RegistrationRow): RegistrationRecord {
  return {
    id: row.id,
    category: row.captureCategory.code,
    categoryLabel: row.captureCategory.label,
    stationId: row.stationId,
    groupId: row.groupId,
    missionCardId: row.missionCardId,
    source: row.source,
    recordedAt: row.recordedAt.toISOString(),
    clientRecordedAt: row.clientRecordedAt?.toISOString() ?? null,
    voided: row.voided,
  };
}
