import type { FallbackWindowRecord } from '@spoh/shared';
import { listWindows } from '../data/repo.js';
import { windowRecords } from './windowRecord.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Windows overlapping a range, oldest first: they explain the numbers. */
export async function listFallbackWindows(
  scope: EventScope,
  range: {
    from?: Date;
    to?: Date;
    rehearsal?: boolean;
  },
): Promise<FallbackWindowRecord[]> {
  return windowRecords(scope, await listWindows(scope, range));
}
