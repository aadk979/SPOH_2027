import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { countUnpurgedResolvedAlerts } from '../data/archiveRepo.js';

/** Read in the lifecycle transaction, whose event lock excludes resolution/purge writers. */
export async function resolvedAlertsPurged(tx: PrismaTransactionClient, scope: EventScope) {
  return (await countUnpurgedResolvedAlerts(tx, scope)) === 0;
}
