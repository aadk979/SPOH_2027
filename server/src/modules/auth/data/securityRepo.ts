import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export async function personNeedsMfa(personId: string): Promise<boolean> {
  const person = await prisma.person.findUniqueOrThrow({
    where: { id: personId },
    select: {
      organisationMemberships: { where: { role: 'PLATFORM_ADMIN' }, select: { id: true } },
      eventMemberships: {
        where: {
          status: { in: ['ACTIVE', 'INVITED'] },
          event: { status: { not: 'ARCHIVED' } },
          role: { in: ['ADMIN', 'LEAD', 'CHIEF_COORDINATOR', 'DEPUTY_COORDINATOR'] },
        },
        select: { id: true },
      },
    },
  });
  return person.organisationMemberships.length > 0 || person.eventMemberships.length > 0;
}

export async function acceptMembership(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { personId: string; at: Date },
) {
  const changed = await tx.eventMembership.updateMany({
    where: { eventId: scope.eventId, personId: input.personId, status: 'INVITED' },
    data: { status: 'ACTIVE', acceptedAt: input.at },
  });
  return changed.count > 0;
}

export async function mfaSession(id: string) {
  return prisma.refreshSession.findUnique({
    where: { id },
    include: { volunteer: { select: { cognitoSub: true } } },
  });
}

export async function completeMfa(tx: PrismaTransactionClient, id: string) {
  await tx.refreshSession.update({
    where: { id },
    data: { mfaPending: false, providerTokenEncrypted: null, providerTokenExpiresAt: null },
  });
}
