import type { EventDayRecord } from '@spoh/shared';
import { toEventDayRecord } from '../data/mappers.js';
import { listEventDayRows } from '../data/repo.js';

export async function listEventDays(): Promise<EventDayRecord[]> {
  return (await listEventDayRows()).map(toEventDayRecord);
}
