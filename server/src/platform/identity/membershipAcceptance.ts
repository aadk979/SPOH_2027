import { prisma } from '../db/client.js';
import { writeAudit } from '../audit/index.js';

/** The first authenticated use of a selected event accepts only that invitation. */
export async function acceptSelectedMembership(input: {
  eventId: string;
  personId: string;
  sub: string;
}) {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.eventMembership.updateMany({
      where: { eventId: input.eventId, personId: input.personId, status: 'INVITED' },
      data: { status: 'ACTIVE', acceptedAt: new Date() },
    });
    if (changed.count) {
      const member = await tx.eventMembership.findUniqueOrThrow({
        where: { eventId_personId: { eventId: input.eventId, personId: input.personId } },
        select: { id: true },
      });
      await writeAudit(tx, {
        eventId: input.eventId,
        membershipId: member.id,
        actorId: input.personId,
        actorSub: input.sub,
        action: 'user.acceptInvite',
        entityType: 'EventMembership',
        entityId: member.id,
        ip: null,
        userAgent: null,
        requestId: null,
        after: { status: 'ACTIVE' },
      });
    }
    return changed.count > 0;
  });
}
