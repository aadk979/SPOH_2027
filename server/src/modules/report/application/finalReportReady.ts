import { FullReport } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { activeFinalSnapshot } from '../data/snapshotRepo.js';

/** A stale, superseded, malformed or practice/range document cannot satisfy close-out. */
export async function finalReportReady(
  tx: PrismaTransactionClient,
  scope: EventScope,
  lifecycleVersion: number,
) {
  const snapshot = await activeFinalSnapshot(tx, scope);
  if (!snapshot || snapshot.lifecycleVersion !== lifecycleVersion || snapshot.rehearsalIncluded) {
    return false;
  }
  const parsed = FullReport.safeParse(snapshot.report);
  if (!parsed.success) return false;
  const report = parsed.data;
  return (
    report.event.status === 'CLOSED' &&
    report.rehearsalIncluded !== true &&
    report.range.from === null &&
    report.range.to === null
  );
}
