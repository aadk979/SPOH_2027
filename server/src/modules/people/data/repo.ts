import type { ListVolunteersQuery } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { pageArgs } from '../../../platform/db/pagination.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { mirrorMembership } from '../../../platform/db/membershipMirror.js';

/**
 * Data access for the people on the roster, as the admin screens see them:
 * the members of the event (ADR-001 §1). Role, portfolio, standing and
 * reporting line are the membership's; name and contact details the person's.
 */

/** The person with their membership of the event, and what they hold in it. */
export function adminSelect(scope: EventScope) {
  return {
    id: true,
    displayName: true,
    email: true,
    phone: true,
    createdAt: true,
    eventMemberships: {
      where: { eventId: scope.eventId },
      select: {
        role: true,
        portfolio: true,
        status: true,
        deactivatedAt: true,
        deactivatedReason: true,
        lastSeenAt: true,
        reportsTo: { select: { person: { select: { id: true, displayName: true } } } },
      },
    },
    // Two facts an admin needs that the person row does not carry: how much
    // work this person is actually holding, and whether any device could be
    // reached if it mattered.
    _count: {
      select: {
        shiftAssignments: { where: { eventId: scope.eventId } },
        pushSubscriptions: true,
      },
    },
  } satisfies Prisma.PersonSelect;
}

export type AdminRow = Prisma.PersonGetPayload<{ select: ReturnType<typeof adminSelect> }>;

/**
 * Nulls first on "last seen": the people who have never signed in are exactly
 * who you open this screen to find, so they belong at the top rather than
 * buried under everyone who has.
 */
const SORTS: Record<ListVolunteersQuery['sort'], Prisma.PersonOrderByWithRelationInput[]> = {
  name: [{ displayName: 'asc' }, { id: 'asc' }],
  role: [{ role: 'asc' }, { displayName: 'asc' }, { id: 'asc' }],
  lastSeen: [
    { lastSeenAt: { sort: 'asc', nulls: 'first' } },
    { displayName: 'asc' },
    { id: 'asc' },
  ],
  created: [{ createdAt: 'desc' }, { id: 'desc' }],
};

export async function listVolunteerRows(
  scope: EventScope,
  query: ListVolunteersQuery,
): Promise<AdminRow[]> {
  const standing =
    query.active === undefined
      ? {}
      : { status: query.active ? ('ACTIVE' as const) : { not: 'ACTIVE' as const } };
  return prisma.person.findMany({
    where: {
      eventMemberships: {
        some: { eventId: scope.eventId, ...standing, ...(query.role ? { role: query.role } : {}) },
      },
      ...(query.q
        ? {
            OR: [
              { displayName: { contains: query.q, mode: 'insensitive' as const } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.stationId || query.eventDayId
        ? {
            shiftAssignments: {
              some: {
                eventId: scope.eventId,
                ...(query.stationId ? { stationId: query.stationId } : {}),
                ...(query.eventDayId ? { eventDayId: query.eventDayId } : {}),
              },
            },
          }
        : {}),
    },
    select: adminSelect(scope),
    orderBy: SORTS[query.sort],
    ...pageArgs(query),
  });
}

export async function findVolunteerRow(scope: EventScope, id: string): Promise<AdminRow | null> {
  return prisma.person.findFirst({
    where: { id, eventMemberships: { some: { eventId: scope.eventId } } },
    select: adminSelect(scope),
  });
}

/** A prospective manager: a member of this event, and whether they are active in it. */
export async function findManager(
  scope: EventScope,
  id: string,
): Promise<{ id: string; active: boolean } | null> {
  const membership = await prisma.eventMembership.findUnique({
    where: { eventId_personId: { eventId: scope.eventId, personId: id } },
    select: { status: true },
  });
  return membership ? { id, active: membership.status === 'ACTIVE' } : null;
}

/** The person this volunteer reports to in this event, for walking a reporting chain. */
export async function findManagerOf(scope: EventScope, id: string): Promise<string | null> {
  const membership = await prisma.eventMembership.findUnique({
    where: { eventId_personId: { eventId: scope.eventId, personId: id } },
    select: { reportsTo: { select: { personId: true } } },
  });
  return membership?.reportsTo?.personId ?? null;
}

export async function updateVolunteerRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  change: { id: string; data: Prisma.PersonUncheckedUpdateInput },
): Promise<AdminRow> {
  await tx.person.update({ where: { id: change.id }, data: change.data });
  await mirrorMembership(tx, scope, change.id);
  return tx.person.findUniqueOrThrow({ where: { id: change.id }, select: adminSelect(scope) });
}

/**
 * A device that can no longer sign in should not keep receiving alerts about
 * an event it is locked out of.
 */
export async function deletePushSubscriptions(
  tx: PrismaTransactionClient,
  volunteerId: string,
): Promise<void> {
  await tx.pushSubscription.deleteMany({ where: { volunteerId } });
}
