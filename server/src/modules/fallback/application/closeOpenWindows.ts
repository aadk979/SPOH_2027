import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { endOpenWindows } from '../data/closeWindows.js';

/** Close-out owns the transaction and audits these ids with the event transition. */
export function closeOpenWindows(tx: PrismaTransactionClient, scope: EventScope, now: Date) {
  return endOpenWindows(tx, scope, now);
}
