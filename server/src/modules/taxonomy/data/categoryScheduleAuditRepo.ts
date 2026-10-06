import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** One provenance query per page; no actor identity or raw audit leaves the mapper. */
export function categoryScheduleDefinitions(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; ids: string[] },
) {
  return input.tx.auditLog.findMany({
    where: {
      eventId: scope.eventId,
      entityType: 'ScheduledAction',
      entityId: { in: input.ids },
      action: { in: ['schedule.create', 'schedule.update'] },
      source: 'USER',
    },
    select: { entityId: true, action: true, actorId: true, after: true },
  });
}
export type CategoryScheduleAuditRow = Awaited<
  ReturnType<typeof categoryScheduleDefinitions>
>[number];
export function categoryScheduleMutationAudits(
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    id: string;
    personId: string;
    action: 'schedule.update' | 'schedule.cancel';
    version: number;
  },
) {
  return input.tx.auditLog.findMany({
    where: {
      eventId: scope.eventId,
      entityType: 'ScheduledAction',
      entityId: input.id,
      actorId: input.personId,
      source: 'USER',
      action: input.action,
      after: { path: ['version'], equals: input.version },
    },
    select: { after: true },
  });
}
