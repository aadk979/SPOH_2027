import type { Prisma } from '../../../generated/prisma/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import type { Audience } from '../domain/audience.js';

/** One predicate for the reach count and the transaction's frozen push audience. */
export function audienceMembershipWhere(
  scope: EventScope,
  input: { audience: Audience; today: Date },
): Prisma.EventMembershipWhereInput {
  const { audience, today } = input;
  return {
    eventId: scope.eventId,
    status: 'ACTIVE',
    ...(audience.role ? { role: audience.role } : {}),
    ...(audience.stationId || audience.eventDayId
      ? {
          person: {
            shiftAssignments: {
              some: {
                eventId: scope.eventId,
                eventDay: { date: today },
                ...(audience.stationId ? { stationId: audience.stationId } : {}),
                ...(audience.eventDayId ? { eventDayId: audience.eventDayId } : {}),
              },
            },
          },
        }
      : {}),
  };
}
