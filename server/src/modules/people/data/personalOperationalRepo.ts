import type { PrismaTransactionClient } from '../../../platform/db/client.js';

const swapProjection = { id: true, eventId: true, assignmentId: true, status: true,
  createdAt: true, decidedAt: true } as const;

export async function erasePersonalIdentityJournals(tx: PrismaTransactionClient, personId: string) {
  const invitations = await tx.identityInvitationAttempt.deleteMany({ where: { personId } });
  const accounts = await tx.identityAccountOperation.deleteMany({ where: { OR: [{ personId }, { plannedPersonId: personId }] } });
  return invitations.count + accounts.count;
}

/** These rows describe this subject's participation without exposing peers or free text. */
export async function exportPersonalOperations(tx: PrismaTransactionClient, personId: string) {
  const person = await tx.person.findUniqueOrThrow({ where: { id: personId }, select: {
    organisationMemberships: { select: { id: true, organisationId: true, role: true,
      createdAt: true, updatedAt: true }, orderBy: { id: 'asc' } },
    attendance: { select: { id: true, eventId: true, eventDayId: true, rehearsal: true,
      method: true, presentAt: true }, orderBy: { id: 'asc' } },
    shiftAssignments: { select: { id: true, eventId: true, shiftId: true, stationId: true,
      eventDayId: true, roleLabel: true, checkedInAt: true, checkedOutAt: true,
      createdAt: true }, orderBy: { id: 'asc' } },
    swapsRequested: { select: swapProjection, orderBy: { id: 'asc' } },
    swapsTargeted: { select: swapProjection, orderBy: { id: 'asc' } },
    swapsDecided: { select: swapProjection, orderBy: { id: 'asc' } },
    // BriefingSlot has an assigned briefier; individual audience attendance is not persisted.
    briefingSlots: { select: { id: true, eventId: true, eventDayId: true, startsAt: true,
      waveSize: true, completedAt: true }, orderBy: { id: 'asc' } },
    identityInvitations: { select: { id: true, organisationId: true, state: true,
      startedAt: true, finishedAt: true }, orderBy: { id: 'asc' } },
  } });
  // CREATE_STARTED/PROVIDER_READY may precede binding the nullable Person relation.
  const identityAccounts = await tx.identityAccountOperation.findMany({
    where: { OR: [{ personId }, { plannedPersonId: personId }] },
    select: { id: true, organisationId: true, state: true, createdAt: true, updatedAt: true, boundAt: true },
    orderBy: { id: 'asc' },
  });
  return { ...person, identityAccounts };
}
