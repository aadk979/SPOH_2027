import type { LostFoundRecord } from '@spoh/shared';
import type { ItemWithContext } from './repo.js';

/**
 * An item as the API returns it. `foundStationId` is a plain scalar with no
 * Prisma relation (see the note at the top of schema.prisma), so the station
 * name comes in beside the row.
 */
export function toItemRecord(item: ItemWithContext, stationName: string | null): LostFoundRecord {
  return {
    id: item.id,
    itemLabel: item.itemLabel,
    categoryLabel: item.categoryLabel,
    foundStationId: item.foundStationId,
    foundStationName: stationName,
    foundAt: item.foundAt.toISOString(),
    holderNote: item.holderNote,
    photoKey: item.photoKey,
    status: item.status,
    loggedById: item.loggedById,
    loggedByName: item.loggedBy.displayName,
    claimedAt: item.claimedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
  };
}
