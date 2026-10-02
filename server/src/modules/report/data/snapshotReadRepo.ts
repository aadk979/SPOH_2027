import type { ReportSnapshotsQuery } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

interface SnapshotCursor {
  id: string;
  createdAt: Date;
}

export function findSnapshotCursor(
  scope: EventScope,
  input: { db: PrismaTransactionClient; query: ReportSnapshotsQuery },
) {
  return input.db.reportSnapshot.findFirst({
    where: { eventId: scope.eventId, id: input.query.cursor, kind: input.query.kind },
    select: { id: true, createdAt: true },
  });
}

interface SnapshotSummaryRow {
  id: string;
  kind: string;
  lifecycleVersion: number;
  createdAt: Date;
  supersededAt: Date | null;
  rehearsalIncluded: boolean;
  range: unknown;
}

/** Project the small range metadata in SQL; a list never loads full report bodies. */
export function listSnapshotRows(
  scope: EventScope,
  input: {
    db: PrismaTransactionClient;
    query: ReportSnapshotsQuery;
    cursor: SnapshotCursor | null;
  },
) {
  const kind = input.query.kind ?? null;
  const createdAt = input.cursor?.createdAt ?? null;
  const id = input.cursor?.id ?? null;
  return input.db.$queryRaw<SnapshotSummaryRow[]>`
    SELECT id, kind::text, "lifecycleVersion", "createdAt", "supersededAt",
           "rehearsalIncluded", report->'range' AS range
    FROM "ReportSnapshot"
    WHERE "eventId" = ${scope.eventId}
      AND (${kind}::text IS NULL OR kind::text = ${kind})
      AND (${createdAt}::timestamptz IS NULL
        OR ("createdAt", id) < (${createdAt}::timestamptz, ${id}::text))
    ORDER BY "createdAt" DESC, id DESC LIMIT ${input.query.limit + 1}
  `;
}

export function findReportSnapshot(
  scope: EventScope,
  input: { db: PrismaTransactionClient; id: string },
) {
  return input.db.reportSnapshot.findFirst({
    where: { eventId: scope.eventId, id: input.id },
  });
}
