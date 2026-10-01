import type { AttendanceMethod, Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { membershipIdOf } from '../../../platform/db/membershipMirror.js';

/**
 * Data access for attendance, challenges and failed attempts. Every query
 * names its event (ADR-001 §2).
 */

const withVerifier = { verifiedBy: true } satisfies Prisma.AttendanceInclude;

export type AttendanceWithVerifier = Prisma.AttendanceGetPayload<{ include: typeof withVerifier }>;

/** A person on a day of the event. */
export interface PersonDay {
  volunteerId: string;
  eventDayId: string;
}

/**
 * Serializes duplicate submissions and PIN attempt counters across API
 * instances: a transaction-scoped advisory lock per person.
 */
export async function lockPerson(tx: PrismaTransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`attendance:${id}`}, 0))`;
}

/**
 * A person as attendance judges them: who they are, and their role and
 * standing in this event, which are their membership's (ADR-001 §1). Null when
 * they are not a member of the event.
 */
export async function findVolunteer(
  db: PrismaTransactionClient,
  scope: EventScope,
  id: string,
): Promise<{ id: string; membershipId: string; role: string; active: boolean } | null> {
  const membership = await db.eventMembership.findUnique({
    where: { eventId_personId: { eventId: scope.eventId, personId: id } },
    select: { id: true, role: true, status: true, person: { select: { id: true } } },
  });
  if (!membership) return null;
  const { person } = membership;
  return {
    ...person,
    membershipId: membership.id,
    role: membership.role,
    active: membership.status === 'ACTIVE',
  };
}

export async function findEventDayOn(db: PrismaTransactionClient, scope: EventScope, date: Date) {
  return db.eventDay.findFirst({ where: { eventId: scope.eventId, date } });
}

export async function findAttendance(
  db: PrismaTransactionClient,
  scope: EventScope,
  key: PersonDay,
): Promise<AttendanceWithVerifier | null> {
  return db.attendance.findUnique({
    where: { volunteerId_eventDayId: key, eventId: scope.eventId },
    include: withVerifier,
  });
}

/** Presence without the verifier's row, for the issuer checks. */
export async function findPresence(db: PrismaTransactionClient, scope: EventScope, key: PersonDay) {
  return db.attendance.findUnique({
    where: { volunteerId_eventDayId: key, eventId: scope.eventId },
  });
}

export async function createAttendance(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: PersonDay & { method: AttendanceMethod; verifiedById: string | null; presentAt: Date },
): Promise<AttendanceWithVerifier> {
  // Sequential: parallel queries overlap on a transaction's connection (F03-019).
  const membershipId = await membershipIdOf(tx, scope, data.volunteerId);
  const verifiedByMembershipId = await membershipIdOf(tx, scope, data.verifiedById);
  return tx.attendance.create({
    data: { ...data, eventId: scope.eventId, membershipId, verifiedByMembershipId },
    include: withVerifier,
  });
}

/** This person's shifts running now, not yet checked in. */
export async function findUncheckedShifts(
  tx: PrismaTransactionClient,
  scope: EventScope,
  where: { volunteerId: string; running: Prisma.ShiftWhereInput },
) {
  return tx.shiftAssignment.findMany({
    where: {
      eventId: scope.eventId,
      volunteerId: where.volunteerId,
      shift: where.running,
      checkedInAt: null,
    },
  });
}

/** Sets the check-in only if it is still empty; false when it was not. */
export async function markShiftCheckedIn(
  tx: PrismaTransactionClient,
  scope: EventScope,
  check: { id: string; volunteerId: string; at: Date },
): Promise<boolean> {
  const changed = await tx.shiftAssignment.updateMany({
    where: {
      eventId: scope.eventId,
      id: check.id,
      volunteerId: check.volunteerId,
      checkedInAt: null,
    },
    data: { checkedInAt: check.at },
  });
  return changed.count > 0;
}

export async function findAttempts(
  tx: PrismaTransactionClient,
  scope: EventScope,
  volunteerId: string,
) {
  return tx.attendanceAttempt.findUnique({ where: { volunteerId, eventId: scope.eventId } });
}

/** Counts a failed-or-pending attempt, starting a new window when the old one ended. */
export async function recordAttempt(
  tx: PrismaTransactionClient,
  scope: EventScope,
  attempt: { volunteerId: string; now: Date; sameWindow: boolean },
): Promise<void> {
  const { volunteerId, now, sameWindow } = attempt;
  await tx.attendanceAttempt.upsert({
    where: { volunteerId, eventId: scope.eventId },
    create: {
      volunteerId,
      eventId: scope.eventId,
      membershipId: await membershipIdOf(tx, scope, volunteerId),
      windowStart: now,
      attempts: 1,
    },
    update: sameWindow ? { attempts: { increment: 1 } } : { windowStart: now, attempts: 1 },
  });
}

/** Rotating immediately invalidates both the previous QR and previous PIN. */
export async function replaceChallenge(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: {
    id: string;
    issuerId: string;
    eventDayId: string;
    pinHash: string;
    campusNetwork: boolean;
    expiresAt: Date;
  },
): Promise<void> {
  await tx.attendanceChallenge.deleteMany({
    where: { eventId: scope.eventId, issuerId: data.issuerId, eventDayId: data.eventDayId },
  });
  await tx.attendanceChallenge.create({
    data: {
      ...data,
      eventId: scope.eventId,
      issuerMembershipId: await membershipIdOf(tx, scope, data.issuerId),
    },
  });
}

export async function findChallenge(
  tx: PrismaTransactionClient,
  scope: EventScope,
  where: { id: string } | { pinHash: string },
) {
  return tx.attendanceChallenge.findUnique({ where: { ...where, eventId: scope.eventId } });
}
