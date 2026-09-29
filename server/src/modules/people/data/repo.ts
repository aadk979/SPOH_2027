import type { ListVolunteersQuery } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { pageArgs } from '../../../platform/db/pagination.js';

/** Data access for the people on the roster, as the admin screens see them. */

export const adminSelect = {
  id: true,
  displayName: true,
  email: true,
  phone: true,
  role: true,
  portfolio: true,
  reportsToId: true,
  active: true,
  deactivatedAt: true,
  deactivatedReason: true,
  lastSeenAt: true,
  createdAt: true,
  reportsTo: { select: { displayName: true } },
  // Two facts an admin needs that the volunteer row does not carry: how much
  // work this person is actually holding, and whether any device could be
  // reached if it mattered.
  _count: { select: { shiftAssignments: true, pushSubscriptions: true } },
} satisfies Prisma.PersonSelect;

export type AdminRow = Prisma.PersonGetPayload<{ select: typeof adminSelect }>;

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

export async function listVolunteerRows(query: ListVolunteersQuery): Promise<AdminRow[]> {
  return prisma.person.findMany({
    where: {
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.role ? { role: query.role } : {}),
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
                ...(query.stationId ? { stationId: query.stationId } : {}),
                ...(query.eventDayId ? { eventDayId: query.eventDayId } : {}),
              },
            },
          }
        : {}),
    },
    select: adminSelect,
    orderBy: SORTS[query.sort],
    ...pageArgs(query),
  });
}

export async function findVolunteerRow(id: string): Promise<AdminRow | null> {
  return prisma.person.findUnique({ where: { id }, select: adminSelect });
}

export async function findManager(id: string): Promise<{ id: string; active: boolean } | null> {
  return prisma.person.findUnique({ where: { id }, select: { id: true, active: true } });
}

/** The person this volunteer reports to, for walking a reporting chain. */
export async function findManagerOf(id: string): Promise<string | null> {
  const row = await prisma.person.findUnique({ where: { id }, select: { reportsToId: true } });
  return row?.reportsToId ?? null;
}

export async function updateVolunteerRow(
  tx: PrismaTransactionClient,
  change: { id: string; data: Prisma.PersonUncheckedUpdateInput },
): Promise<AdminRow> {
  return tx.person.update({ where: { id: change.id }, data: change.data, select: adminSelect });
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
