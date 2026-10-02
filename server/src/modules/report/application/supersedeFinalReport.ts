import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { supersedeFinalSnapshots } from '../data/snapshotRepo.js';

/** The old document remains immutable evidence after reopening. */
export function supersedeFinalReport(tx: PrismaTransactionClient, scope: EventScope, now: Date) {
  return supersedeFinalSnapshots(tx, scope, now);
}
