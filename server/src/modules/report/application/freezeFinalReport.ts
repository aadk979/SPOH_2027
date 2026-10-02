import { FullReport } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import type { Clock } from '../../../platform/time/index.js';
import { saveFinalSnapshot } from '../data/snapshotRepo.js';
import { generateReportInTransaction } from './generateReport.js';

/** Only the public report schema crosses storage; visitor values are a separate export read. */
export async function freezeFinalReport(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { lifecycleVersion: number; personId: string; clock: Clock },
) {
  const report = FullReport.parse(
    await generateReportInTransaction(tx, scope, { query: {}, clock: input.clock }),
  );
  const snapshot = await saveFinalSnapshot(tx, scope, {
    report,
    lifecycleVersion: input.lifecycleVersion,
    personId: input.personId,
    createdAt: input.clock.now(),
  });
  return snapshot.id;
}
