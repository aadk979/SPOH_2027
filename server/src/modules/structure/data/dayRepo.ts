import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
export function findRemovableDay(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string },
) {
  return input.tx.eventDay.findFirst({
    where: { eventId: scope.eventId, id: input.id },
    include: {
      _count: {
        select: {
          shiftAssignments: true,
          briefingSlots: true,
          announcements: true,
          announcementDrafts: true,
          attendance: true,
          attendanceChallenges: true,
        },
      },
    },
  });
}
export async function eventHasCapture(scope: EventScope, tx: PrismaTransactionClient) {
  const where = { eventId: scope.eventId };
  const registrations = await tx.registration.count({ where });
  const footfall = await tx.footfallTick.count({ where });
  const stamps = await tx.cardStampEvent.count({ where });
  const gifts = await tx.giftRedemption.count({ where });
  return registrations + footfall + stamps + gifts > 0;
}
export async function removeDayRows(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string },
) {
  await input.tx.shift.deleteMany({ where: { eventId: scope.eventId, eventDayId: input.id } });
  await input.tx.eventDay.delete({ where: { eventId: scope.eventId, id: input.id } });
}
