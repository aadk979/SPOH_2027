import type { LostFoundRecord } from '@spoh/shared';
import { findStationById } from '../../station/index.js';
import { toItemRecord } from '../data/mappers.js';
import type { ItemWithContext } from '../data/repo.js';

/** One item as a record, with its station's name. */
export async function toRecordWithStation(item: ItemWithContext): Promise<LostFoundRecord> {
  const station = item.foundStationId ? await findStationById(item.foundStationId) : null;
  return toItemRecord(item, station?.name ?? null);
}
