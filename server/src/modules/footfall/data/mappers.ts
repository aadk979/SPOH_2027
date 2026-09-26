import type { FootfallTickRecord } from '@spoh/shared';
import type { FootfallTick } from '../../../generated/prisma/client.js';

export function toFootfallTickRecord(row: FootfallTick): FootfallTickRecord {
  return {
    id: row.id,
    stationId: row.stationId,
    quantity: row.quantity,
    source: row.source,
    recordedAt: row.recordedAt.toISOString(),
    clientRecordedAt: row.clientRecordedAt?.toISOString() ?? null,
    timeBlockStart: row.timeBlockStart?.toISOString() ?? null,
    voided: row.voided,
  };
}
