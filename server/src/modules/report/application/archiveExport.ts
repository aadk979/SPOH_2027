import { randomUUID } from 'node:crypto';
import { ERROR_CODES, FullReport, type CreateArchiveExportRequest } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { toArchiveExport } from '../data/archiveExportMapper.js';
import {
  archiveExportRow,
  archiveExportRows,
  completedArchiveExport,
  lockExportEvent,
  saveArchiveExport,
} from '../data/archiveExportRepo.js';
import { activeFinalSnapshot } from '../data/snapshotRepo.js';
import { archiveStorage } from './archiveStorage.js';
import { toXlsx } from './export/toXlsx.js';
import { finalReportReady } from './finalReportReady.js';

async function prepareArchiveExport(
  tx: PrismaTransactionClient,
  actor: ActorContext & { clock?: Clock },
) {
  const event = await lockExportEvent(tx, actor.scope);
  await requireCurrentPermission(tx, {
    scope: actor.scope,
    personId: actor.volunteerId,
    membershipId: actor.membershipId,
    action: 'Report.Export',
    clock: actor.clock,
  });
  if (event.status !== 'CLOSED')
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'Close the event before preparing its final export pack.',
    );
  if (!(await finalReportReady(tx, actor.scope, event.lifecycleVersion)))
    throw new ConflictError(ERROR_CODES.CONFLICT, 'A current frozen final report is required.');
  const snapshot = await activeFinalSnapshot(tx, actor.scope);
  if (!snapshot) throw new NotFoundError('Final report');
  return snapshot;
}

/** The S3 object becomes reachable only with a committed row and audit in the same transaction. */
export function createArchiveExport(
  request: CreateArchiveExportRequest,
  actor: ActorContext & { clock?: Clock },
) {
  return prisma.$transaction(
    async (tx) => {
      const snapshot = await prepareArchiveExport(tx, actor);
      await lockReserved(tx, actor.scope, request.idempotencyKey);
      const id = randomUUID();
      const key = `archive/${actor.scope.eventId}/${id}.xlsx`;
      await archiveStorage().write({ key, body: await toXlsx(FullReport.parse(snapshot.report)) });
      const row = await saveArchiveExport(actor.scope, {
        tx,
        id,
        snapshotId: snapshot.id,
        lifecycleVersion: snapshot.lifecycleVersion,
        objectKey: key,
        now: (actor.clock ?? systemClock).now(),
      });
      await writeAudit(tx, {
        ...actor.audit,
        action: 'report.archiveExport',
        entityType: 'ArchiveExport',
        entityId: id,
        after: { snapshotId: snapshot.id, objectKey: key, visitorValuesIncluded: false },
      });
      const response = { data: toArchiveExport(row) };
      await settleReserved(tx, actor.scope, {
        key: request.idempotencyKey,
        statusCode: 201,
        body: response,
      });
      return response;
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
export async function readArchiveExport(scope: EventScope, id: string) {
  const row = await archiveExportRow(scope, id);
  if (!row) throw new NotFoundError('Final export pack');
  return {
    body: await archiveStorage().read(row.objectKey),
    fileName: `final-export-${row.id}.xlsx`,
  };
}
export async function listArchiveExports(scope: EventScope) {
  return { data: (await archiveExportRows(scope)).map(toArchiveExport) };
}
export async function archiveExportReady(
  tx: PrismaTransactionClient,
  scope: EventScope,
  lifecycleVersion: number,
) {
  return (await completedArchiveExport(scope, { tx, lifecycleVersion })) !== null;
}
