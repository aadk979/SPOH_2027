import type { AttendanceMethod, Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';

/** Data access for attendance, challenges and failed attempts. */

const withVerifier = { verifiedBy: true } satisfies Prisma.AttendanceInclude;

export type AttendanceWithVerifier = Prisma.AttendanceGetPayload<{ include: typeof withVerifier }>;

/**
 * Serializes duplicate submissions and PIN attempt counters across API
 * instances: a transaction-scoped advisory lock per person.
 */
export async function lockPerson(tx: PrismaTransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`attendance:${id}`}, 0))`;
}

export async function findVolunteer(db: PrismaTransactionClient, id: string) {
  return db.volunteer.findUnique({ where: { id } });
}

export async function findVolunteerOrThrow(db: PrismaTransactionClient, id: string) {
  return db.volunteer.findUniqueOrThrow({ where: { id } });
}

export async function findEventDayOn(db: PrismaTransactionClient, date: Date) {
  return db.eventDay.findUnique({ where: { date } });
}

export async function findAttendance(
  db: PrismaTransactionClient,
  volunteerId: string,
  eventDayId: string,
): Promise<AttendanceWithVerifier | null> {
  return db.attendance.findUnique({
    where: { volunteerId_eventDayId: { volunteerId, eventDayId } },
    include: withVerifier,
  });
}

/** Presence without the verifier's row, for the issuer checks. */
export async function findPresence(
  db: PrismaTransactionClient,
  volunteerId: string,
  eventDayId: string,
) {
  return db.attendance.findUnique({
    where: { volunteerId_eventDayId: { volunteerId, eventDayId } },
  });
}

export async function createAttendance(
  tx: PrismaTransactionClient,
  data: {
    volunteerId: string;
    eventDayId: string;
    method: AttendanceMethod;
    verifiedById: string | null;
    presentAt: Date;
  },
): Promise<AttendanceWithVerifier> {
  return tx.attendance.create({ data, include: withVerifier });
}

/** This person's shifts on the day, in the given blocks, not yet checked in. */
export async function findUncheckedShifts(
  tx: PrismaTransactionClient,
  where: {
    volunteerId: string;
    eventDayId: string;
    blocks: Prisma.ShiftAssignmentWhereInput['block'];
  },
) {
  return tx.shiftAssignment.findMany({
    where: {
      volunteerId: where.volunteerId,
      eventDayId: where.eventDayId,
      block: where.blocks,
      checkedInAt: null,
    },
  });
}

/** Sets the check-in only if it is still empty; false when it was not. */
export async function markShiftCheckedIn(
  tx: PrismaTransactionClient,
  where: { id: string; volunteerId: string },
  at: Date,
): Promise<boolean> {
  const changed = await tx.shiftAssignment.updateMany({
    where: { ...where, checkedInAt: null },
    data: { checkedInAt: at },
  });
  return changed.count > 0;
}

export async function findAttempts(tx: PrismaTransactionClient, volunteerId: string) {
  return tx.attendanceAttempt.findUnique({ where: { volunteerId } });
}

/** Counts a failed-or-pending attempt, starting a new window when the old one ended. */
export async function recordAttempt(
  tx: PrismaTransactionClient,
  volunteerId: string,
  { now, sameWindow }: { now: Date; sameWindow: boolean },
): Promise<void> {
  await tx.attendanceAttempt.upsert({
    where: { volunteerId },
    create: { volunteerId, windowStart: now, attempts: 1 },
    update: sameWindow ? { attempts: { increment: 1 } } : { windowStart: now, attempts: 1 },
  });
}

/** Rotating immediately invalidates both the previous QR and previous PIN. */
export async function replaceChallenge(
  tx: PrismaTransactionClient,
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
    where: { issuerId: data.issuerId, eventDayId: data.eventDayId },
  });
  await tx.attendanceChallenge.create({ data });
}

export async function findChallenge(
  tx: PrismaTransactionClient,
  where: { id: string } | { pinHash: string },
) {
  return tx.attendanceChallenge.findUnique({ where });
}
