import type { FallbackWindowRecord } from '@spoh/shared';
import type { WindowRow } from './repo.js';

export function toWindowRecord(
  window: WindowRow,
  names: { declaredByName: string | null; stationName: string | null },
  durationMinutes: number | null,
): FallbackWindowRecord {
  return {
    id: window.id,
    rehearsal: window.rehearsal,
    tier: window.tier,
    startedAt: window.startedAt.toISOString(),
    endedAt: window.endedAt?.toISOString() ?? null,
    stationId: window.stationId,
    stationName: names.stationName,
    declaredById: window.declaredById,
    declaredByName: names.declaredByName ?? 'Unknown',
    reason: window.reason,
    open: window.endedAt === null,
    durationMinutes,
  };
}
