import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { SessionScope } from '../domain/sessionScope.js';

/** Session settings follow the explicit real organisation, including before its first event. */
export async function sessionOrganisation(scope: SessionScope, tx: PrismaTransactionClient = prisma): Promise<string> {
  if ('organisationId' in scope) return scope.organisationId;
  const event = await tx.event.findUniqueOrThrow({ where: { id: scope.eventId }, select: { organisationId: true } });
  return event.organisationId;
}
