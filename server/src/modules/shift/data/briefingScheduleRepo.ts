import type { CreateBriefingSlotRequest } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { membershipIdOf } from '../../../platform/db/membershipMirror.js';

export async function briefingScheduleContext(
  tx: PrismaTransactionClient,
  scope: EventScope,
  request: CreateBriefingSlotRequest,
) {
  const day = await tx.eventDay.findFirst({
    where: { eventId: scope.eventId, id: request.eventDayId },
    select: { date: true },
  });
  const event = await tx.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: { timezone: true, status: true },
  });
  const member = request.briefierId
    ? await tx.eventMembership.findUnique({
        where: { eventId_personId: { eventId: scope.eventId, personId: request.briefierId } },
        select: { status: true },
      })
    : null;
  return { day, event, member, startsAt: new Date(request.startsAt) };
}

export async function insertBriefingSlot(
  tx: PrismaTransactionClient,
  scope: EventScope,
  request: CreateBriefingSlotRequest,
) {
  return tx.briefingSlot.create({
    data: {
      eventId: scope.eventId,
      eventDayId: request.eventDayId,
      startsAt: new Date(request.startsAt),
      briefierId: request.briefierId,
      briefierMembershipId: request.briefierId
        ? await membershipIdOf(tx, scope, request.briefierId)
        : null,
      waveSize: request.waveSize,
      notes: request.notes ?? null,
    },
    select: { id: true },
  });
}
