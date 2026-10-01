import type { MissionCardRecord } from '@spoh/shared';
import type { CardWithContext } from './repo.js';

export function toMissionCardRecord(
  card: CardWithContext,
  stampingStationIds: readonly string[],
): MissionCardRecord {
  const visited = new Set(card.stampEvents.map((stamp) => stamp.stationId));

  return {
    id: card.id,
    rehearsal: card.rehearsal,
    shortCode: card.shortCode,
    status: card.status,
    issuedAt: card.issuedAt?.toISOString() ?? null,
    completedAt: card.completedAt?.toISOString() ?? null,
    voidedAt: card.voidedAt?.toISOString() ?? null,
    reissuedFromId: card.reissuedFromId,
    batchLabel: card.batchLabel,
    stamps: card.stampEvents.map((stamp) => ({
      id: stamp.id,
      rehearsal: stamp.rehearsal,
      stationId: stamp.stationId,
      stationName: stamp.station.name,
      recordedAt: stamp.recordedAt.toISOString(),
      recordedByName: stamp.recordedBy.displayName,
      source: stamp.source,
    })),
    // What the facilitator needs to tell the visitor: where to go next.
    remainingStationIds: stampingStationIds.filter((id) => !visited.has(id)),
    redeemed: card.redemptions.length > 0,
  };
}
