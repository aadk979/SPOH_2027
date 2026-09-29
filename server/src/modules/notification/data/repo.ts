import type { CommitteeRole } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Data access for push subscriptions and the people they reach. */

/** The event's active members, optionally of these roles (ADR-001 §1). */
export async function findActiveVolunteerIds(
  scope: EventScope,
  roles?: CommitteeRole[],
): Promise<string[]> {
  const rows = await prisma.eventMembership.findMany({
    where: { eventId: scope.eventId, status: 'ACTIVE', ...(roles ? { role: { in: roles } } : {}) },
    select: { personId: true },
  });
  return rows.map((row) => row.personId);
}

/** Active members rostered at a station on the given day. */
export async function findRosteredAt(
  scope: EventScope,
  posting: { stationId: string; day: Date },
): Promise<string[]> {
  const rows = await prisma.shiftAssignment.findMany({
    where: {
      eventId: scope.eventId,
      stationId: posting.stationId,
      eventDay: { date: posting.day },
      volunteer: { eventMemberships: { some: { eventId: scope.eventId, status: 'ACTIVE' } } },
    },
    select: { volunteerId: true },
  });
  return rows.map((row) => row.volunteerId);
}

export async function findSubscriptions(volunteerIds: string[]) {
  return prisma.pushSubscription.findMany({
    where: { volunteerId: { in: volunteerIds } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
}

export async function deleteSubscriptions(ids: string[]): Promise<number> {
  const { count } = await prisma.pushSubscription.deleteMany({ where: { id: { in: ids } } });
  return count;
}

/**
 * Keyed on the endpoint, because that is what the push service treats as
 * unique. Re-subscribing on the same device produces the same endpoint, so this
 * is an upsert — and it reassigns ownership, which is what should happen when a
 * shared booth tablet is handed to the next volunteer.
 */
export async function upsertSubscription(
  input: {
    volunteerId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent: string | null;
  },
  now: Date,
): Promise<{ id: string }> {
  return prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      volunteerId: input.volunteerId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
      lastSeenAt: now,
    },
    update: {
      volunteerId: input.volunteerId,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
      lastSeenAt: now,
      failureCount: 0,
    },
    select: { id: true },
  });
}

/** Deletes this person's least recently seen devices beyond `keep`; returns how many went. */
export async function pruneDevicesBeyond(volunteerId: string, keep: number): Promise<number> {
  const stale = await prisma.pushSubscription.findMany({
    where: { volunteerId },
    orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
    skip: keep,
    select: { id: true },
  });
  if (stale.length === 0) return 0;
  return deleteSubscriptions(stale.map((row) => row.id));
}

/** Scoped to the owner: you may only unsubscribe yourself. */
export async function deleteOwnSubscription(
  volunteerId: string,
  endpoint: string,
): Promise<number> {
  const { count } = await prisma.pushSubscription.deleteMany({ where: { endpoint, volunteerId } });
  return count;
}
