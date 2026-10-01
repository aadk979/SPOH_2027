import type { ListVolunteersQuery } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { membershipIdOf } from '../../../platform/db/membershipMirror.js';

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
 * The roster is the event's memberships, ordered by what the screen shows:
 * the membership's role and last visit, the person's name. Nulls first on
 * "last seen": the people who have never signed in are exactly who you open
 * this screen to find, so they belong at the top rather than buried under
 * everyone who has. `personId` breaks ties, and is the cursor.
 */
const SORTS: Record<ListVolunteersQuery['sort'], Prisma.EventMembershipOrderByWithRelationInput[]> =
  {
    name: [{ person: { displayName: 'asc' } }, { personId: 'asc' }],
    role: [{ role: 'asc' }, { person: { displayName: 'asc' } }, { personId: 'asc' }],
    lastSeen: [
      { lastSeenAt: { sort: 'asc', nulls: 'first' } },
      { person: { displayName: 'asc' } },
      { personId: 'asc' },
    ],
    created: [{ person: { createdAt: 'desc' } }, { personId: 'desc' }],
  };

/** Who matches the search, the station or the day, as a filter on the person. */
function personFilter(scope: EventScope, query: ListVolunteersQuery): Prisma.PersonWhereInput {
  return {
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
  };
}

export async function listVolunteerRows(
  scope: EventScope,
  query: ListVolunteersQuery,
): Promise<AdminRow[]> {
  const { eventId } = scope;
  const standing =
    query.active === undefined
      ? {}
      : { status: query.active ? ('ACTIVE' as const) : { not: 'ACTIVE' as const } };
  const rows = await prisma.eventMembership.findMany({
    where: {
      eventId,
      ...standing,
      ...(query.role ? { role: query.role } : {}),
      person: personFilter(scope, query),
    },
    select: { person: { select: adminSelect(scope) } },
    orderBy: SORTS[query.sort],
    take: query.limit + 1,
    ...(query.cursor
      ? { cursor: { eventId_personId: { eventId, personId: query.cursor } }, skip: 1 }
      : {}),
  });
  return rows.map((row) => row.person);
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

/** A change to someone on the roster: their contact details, and what they are in the event. */
export interface VolunteerChange {
  id: string;
  person?: { displayName?: string; phone?: string | null };
  membership?: {
    role?: Prisma.EventMembershipUncheckedUpdateInput['role'];
    portfolio?: string | null;
    /** The manager as a person; stored as their membership of the event. */
    reportsToPersonId?: string | null;
    status?: 'ACTIVE' | 'DEACTIVATED';
    deactivatedAt?: Date | null;
    deactivatedReason?: string | null;
  };
}

export async function updateVolunteerRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  change: VolunteerChange,
): Promise<AdminRow> {
  const { eventId } = scope;
  if (change.person && Object.keys(change.person).length > 0) {
    await tx.person.update({ where: { id: change.id }, data: change.person });
  }
  if (change.membership) {
    const { reportsToPersonId, ...fields } = change.membership;
    const reportsToId =
      reportsToPersonId === undefined
        ? undefined
        : await membershipIdOf(tx, scope, reportsToPersonId);
    await tx.eventMembership.update({
      where: { eventId_personId: { eventId, personId: change.id } },
      data: { ...fields, ...(reportsToId !== undefined ? { reportsToId } : {}) },
    });
  }
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
