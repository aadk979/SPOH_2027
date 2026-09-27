import type { LostFoundRecord } from '@spoh/shared';
import { findStationNames } from '../../station/index.js';
import { toItemRecord } from '../data/mappers.js';
import type { ItemWithContext } from '../data/repo.js';

/**
 * Items as records, with every found-at station named in one query for the
 * whole list rather than one per item (F03-029).
 */
export async function toRecordsWithStations(
  items: readonly ItemWithContext[],
): Promise<LostFoundRecord[]> {
  const names = await findStationNames(
    items.flatMap((item) => (item.foundStationId ? [item.foundStationId] : [])),
  );
  return items.map((item) =>
    toItemRecord(item, item.foundStationId ? (names.get(item.foundStationId) ?? null) : null),
  );
}

/** One item as a record, with its station's name. */
export async function toRecordWithStation(item: ItemWithContext): Promise<LostFoundRecord> {
  const [record] = await toRecordsWithStations([item]);
  return record as LostFoundRecord;
}
