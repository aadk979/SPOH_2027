import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { membershipIdOf } from '../../../platform/db/membershipMirror.js';

export async function recordRosterImport(tx: PrismaTransactionClient, scope: EventScope, input: {
  rowCount: number; importedById: string; now: Date;
}) {
  const event = await tx.event.findUniqueOrThrow({ where: { id: scope.eventId }, select: { status: true } });
  return tx.importBatch.create({ data: { eventId: scope.eventId, rehearsal: event.status === 'REHEARSAL', source: 'APP',
    targetTable: 'Roster', rowCount: input.rowCount, importedById: input.importedById,
    importedByMembershipId: await membershipIdOf(tx, scope, input.importedById), importedAt: input.now,
    provenanceVersion: 0, fallbackWindowId: null, fileName: null, notes: null }, select: { id: true } });
}
