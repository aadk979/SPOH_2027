import { ReportSnapshotSummary, type ReportSnapshotsQuery } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { findSnapshotCursor, listSnapshotRows } from '../data/snapshotReadRepo.js';

/** Immutable (time, id) keyset pagination stays stable when newer snapshots arrive. */
export function listSnapshots(scope: EventScope, query: ReportSnapshotsQuery) {
  return prisma.$transaction(
    async (db) => {
      const cursor = query.cursor ? await findSnapshotCursor(scope, { db, query }) : null;
      if (query.cursor && !cursor) throw new NotFoundError('Report snapshot');
      const rows = await listSnapshotRows(scope, { db, query, cursor });
      const data = rows.slice(0, query.limit).map((row) =>
        ReportSnapshotSummary.parse({
          ...row,
          createdAt: row.createdAt.toISOString(),
          supersededAt: row.supersededAt?.toISOString() ?? null,
        }),
      );
      return {
        data,
        meta: {
          count: data.length,
          nextCursor: rows.length > query.limit ? data.at(-1)!.id : null,
        },
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 30_000 },
  );
}
