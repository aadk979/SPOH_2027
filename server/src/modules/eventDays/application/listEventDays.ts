import type { EventDayRecord } from '@spoh/shared';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { toEventDayRecord } from '../data/mappers.js';
import { listEventDayRows } from '../data/repo.js';

export async function listEventDays(scope: EventScope): Promise<EventDayRecord[]> {
  return (await listEventDayRows(scope)).map(toEventDayRecord);
}
