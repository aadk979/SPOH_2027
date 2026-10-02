import { FullReport } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { InternalError, NotFoundError } from '../../../platform/errors/index.js';
import { findReportSnapshot } from '../data/snapshotReadRepo.js';

/** This is a saved document, never a fallback to current report generation. */
export async function readSnapshot(scope: EventScope, id: string): Promise<FullReport> {
  const row = await findReportSnapshot(scope, { db: prisma, id });
  if (!row) throw new NotFoundError('Report snapshot');
  const report = FullReport.parse(row.report);
  if ((report.rehearsalIncluded ?? false) !== row.rehearsalIncluded) {
    throw new InternalError('Report snapshot provenance is inconsistent');
  }
  return FullReport.parse({
    ...report,
    rehearsalIncluded: row.rehearsalIncluded,
    snapshot: {
      id: row.id,
      kind: row.kind,
      lifecycleVersion: row.lifecycleVersion,
      createdAt: row.createdAt.toISOString(),
      supersededAt: row.supersededAt?.toISOString() ?? null,
    },
  });
}
