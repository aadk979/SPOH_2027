import type { FallbackWindowRecord } from '@spoh/shared';
import { listWindows } from '../data/repo.js';
import { windowRecords } from './windowRecord.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';

/** Windows overlapping a range, oldest first: they explain the numbers. */
export async function listFallbackWindows(
  scope: EventScope,
  range: {
    from?: Date;
    to?: Date;
    rehearsal?: boolean;
  },
  db: PrismaTransactionClient = prisma,
): Promise<FallbackWindowRecord[]> {
  return windowRecords(scope, await listWindows(scope, range, db), db);
}
