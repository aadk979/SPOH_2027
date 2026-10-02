import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import type { EventStatus } from '@spoh/shared';

const LIFECYCLE = {
  id: true,
  status: true,
  lifecycleVersion: true,
  hasBeenLive: true,
  closedAt: true,
} satisfies Prisma.EventSelect;
export type LifecycleStateRow = Prisma.EventGetPayload<{ select: typeof LIFECYCLE }>;
const STRUCTURE = {
  ...LIFECYCLE,
  timezone: true,
  organisationId: true,
  _count: {
    select: {
      days: true,
      shiftTemplates: { where: { active: true } },
      stationTypes: { where: { active: true } },
      captureCategories: { where: { active: true } },
    },
  },
} satisfies Prisma.EventSelect;
export type LifecycleEvent = Prisma.EventGetPayload<{ select: typeof STRUCTURE }>;

export async function lifecycleState(scope: EventScope) {
  return prisma.event.findUniqueOrThrow({ where: { id: scope.eventId }, select: LIFECYCLE });
}

export async function lockLifecycleEvent(tx: PrismaTransactionClient, scope: EventScope) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${scope.eventId} FOR UPDATE`;
  return tx.event.findUniqueOrThrow({ where: { id: scope.eventId }, select: STRUCTURE });
}

export async function registrationStationTypeCount(tx: PrismaTransactionClient, scope: EventScope) {
  return tx.stationType.count({
    where: { eventId: scope.eventId, active: true, registersVisitors: true },
  });
}

/** The trigger increments version, including when a previous API version writes the phase. */
export async function writeEventPhase(
  tx: PrismaTransactionClient,
  scope: EventScope,
  phase: { status: EventStatus; closedAt?: Date },
) {
  return tx.event.update({ where: { id: scope.eventId }, data: phase, select: LIFECYCLE });
}
