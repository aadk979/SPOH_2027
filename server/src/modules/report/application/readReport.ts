import { ERROR_CODES, FullReport, type ReportQuery } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { ConflictError } from '../../../platform/errors/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { findReportEvent } from '../data/readScope.js';
import { activeFinalSnapshot } from '../data/snapshotRepo.js';
import { generateReportInTransaction } from './generateReport.js';

/** Whole-event reads after close stay frozen; explicit current/practice/range reads are labelled. */
export function readReport(scope: EventScope, query: ReportQuery, clock: Clock = systemClock) {
  return prisma.$transaction(
    async (tx) => {
      const event = await findReportEvent({ ...scope, db: tx });
      const closed = event.status === 'CLOSED' || event.status === 'ARCHIVED';
      const current =
        query.current || query.includeRehearsal || query.from || query.to || query.eventDayId;
      if (!closed || current) return generateReportInTransaction(tx, scope, { query, clock });
      const snapshot = await activeFinalSnapshot(tx, scope);
      if (!snapshot) {
        throw new ConflictError(
          ERROR_CODES.CONFLICT,
          'No frozen final report exists. Choose a current report.',
        );
      }
      return {
        ...FullReport.parse(snapshot.report),
        snapshot: {
          id: snapshot.id,
          kind: 'FINAL' as const,
          lifecycleVersion: snapshot.lifecycleVersion,
          createdAt: snapshot.createdAt.toISOString(),
        },
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 30_000 },
  );
}
