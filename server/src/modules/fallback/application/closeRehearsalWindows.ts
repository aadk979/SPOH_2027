import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { endRehearsalWindows } from '../data/repo.js';

/** The lifecycle owns this transaction and records the closed ids in its transition audit. */
export function closeRehearsalWindows(tx: PrismaTransactionClient, scope: EventScope, now: Date) {
  return endRehearsalWindows(tx, scope, now);
}
