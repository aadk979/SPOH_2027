import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export function directPublicationMembership(scope: EventScope, input: { tx: PrismaTransactionClient; personId: string }) {
  return input.tx.eventMembership.findFirst({ where: { eventId: scope.eventId,
    personId: input.personId }, select: { id: true, role: true } });
}
