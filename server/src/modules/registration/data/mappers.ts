import type { RegistrationRecord } from '@spoh/shared';
import type { Registration } from '../../../generated/prisma/client.js';

export function toRegistrationRecord(row: Registration): RegistrationRecord {
  return {
    id: row.id,
    category: row.category,
    stationId: row.stationId,
    groupId: row.groupId,
    missionCardId: row.missionCardId,
    source: row.source,
    recordedAt: row.recordedAt.toISOString(),
    clientRecordedAt: row.clientRecordedAt?.toISOString() ?? null,
    voided: row.voided,
  };
}
