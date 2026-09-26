import { randomInt, randomUUID } from 'node:crypto';
import type {
  AttendanceChallenge,
  AttendanceProof,
  AttendanceRecord,
  AttendanceStatus,
} from '@spoh/shared';
import { env } from '../../config/env.js';
import { writeAudit, type AuditContext } from '../../platform/audit/index.js';
import { isCampusIp } from './campusNetwork.js';
import { AppError, ForbiddenError, RateLimitedError } from '../../platform/errors/index.js';
import { prisma, type PrismaTransactionClient } from '../../platform/db/client.js';
import {
  activeShiftBlocks,
  eventDayAnchor,
  singaporeDateString,
} from '../../platform/time/index.js';
import {
  ATTENDANCE_TTL_MS,
  hashPin,
  signAttendanceToken,
  verifyAttendanceToken,
} from './tokens.js';

type Person = { id: string; email: string; role: string; active: boolean };
function isRoot(person: Person): boolean {
  return (
    person.active &&
    person.role === 'ADMIN' &&
    person.email.toLowerCase() === env.ATTENDANCE_ROOT_EMAIL
  );
}
function onCampus(ip: string | null | undefined): boolean {
  return isCampusIp(ip, env.ATTENDANCE_SP_CIDRS);
}
async function context(volunteerId: string, tx = prisma, now = new Date()) {
  const [person, day] = await Promise.all([
    tx.volunteer.findUniqueOrThrow({ where: { id: volunteerId } }),
    tx.eventDay.findUnique({ where: { date: eventDayAnchor(singaporeDateString(now)) } }),
  ]);
  if (!person.active) throw new ForbiddenError('This account is inactive.');
  return { person, day };
}
function record(row: {
  id: string;
  presentAt: Date;
  method: AttendanceRecord['method'];
  verifiedBy: { displayName: string } | null;
}): AttendanceRecord {
  return {
    id: row.id,
    presentAt: row.presentAt.toISOString(),
    method: row.method,
    verifiedByName: row.verifiedBy?.displayName ?? null,
  };
}
export async function attendanceStatus(
  volunteerId: string,
  ip: string | undefined,
): Promise<AttendanceStatus> {
  const now = new Date();
  const { person, day } = await context(volunteerId, prisma, now);
  const attendance = day
    ? await prisma.attendance.findUnique({
        where: { volunteerId_eventDayId: { volunteerId, eventDayId: day.id } },
        include: { verifiedBy: true },
      })
    : null;
  let canIssue = false;
  if (day && attendance) {
    try {
      await assertIssuer(prisma, volunteerId, day.id);
      canIssue = true;
    } catch (error) {
      if (!(error instanceof ForbiddenError)) throw error;
    }
  }
  return {
    eventDay: day ? { id: day.id, label: day.label } : null,
    configured: Boolean(env.ATTENDANCE_ROOT_EMAIL),
    isRoot: isRoot(person),
    isExco: person.role !== 'VOLUNTEER',
    onCampusNetwork: onCampus(ip),
    networkConfigured: env.ATTENDANCE_SP_CIDRS.length > 0,
    attendance: attendance ? record(attendance) : null,
    canIssue,
    serverTime: now.toISOString(),
  };
}

async function lockPerson(tx: PrismaTransactionClient, id: string): Promise<void> {
  // Serializes duplicate submissions and PIN attempt counters across API instances.
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`attendance:${id}`}, 0))`;
}

async function markPresent(
  tx: PrismaTransactionClient,
  person: Person,
  dayId: string,
  method: AttendanceRecord['method'],
  verifierId: string | null,
  audit: AuditContext,
  now: Date,
): Promise<AttendanceRecord> {
  const existing = await tx.attendance.findUnique({
    where: { volunteerId_eventDayId: { volunteerId: person.id, eventDayId: dayId } },
    include: { verifiedBy: true },
  });
  const row =
    existing ??
    (await tx.attendance.create({
      data: {
        volunteerId: person.id,
        eventDayId: dayId,
        method,
        verifiedById: verifierId,
        presentAt: now,
      },
      include: { verifiedBy: true },
    }));
  if (!existing)
    await writeAudit(tx, {
      ...audit,
      action: 'attendance.present',
      entityType: 'Attendance',
      entityId: row.id,
      after: { eventDayId: dayId, method, verifiedById: verifierId, presentAt: now.toISOString() },
    });
  const shifts = await tx.shiftAssignment.findMany({
    where: {
      volunteerId: person.id,
      eventDayId: dayId,
      block: { in: activeShiftBlocks(now) },
      checkedInAt: null,
    },
  });
  for (const shift of shifts) {
    const changed = await tx.shiftAssignment.updateMany({
      where: { id: shift.id, volunteerId: person.id, checkedInAt: null },
      data: { checkedInAt: now },
    });
    if (changed.count)
      await writeAudit(tx, {
        ...audit,
        action: 'shift.checkIn',
        entityType: 'ShiftAssignment',
        entityId: shift.id,
        after: { checkedInAt: now.toISOString(), attendanceId: row.id },
      });
  }
  return record(row);
}

export async function startAttendance(
  volunteerId: string,
  audit: AuditContext,
): Promise<AttendanceRecord> {
  return prisma.$transaction(async (tx) => {
    await lockPerson(tx, volunteerId);
    const now = new Date();
    const person = await tx.volunteer.findUniqueOrThrow({ where: { id: volunteerId } });
    const day = await tx.eventDay.findUnique({
      where: { date: eventDayAnchor(singaporeDateString(now)) },
    });
    if (!isRoot(person))
      throw new ForbiddenError('Only the configured root admin can open attendance.');
    if (!day) throw new ForbiddenError('Today is not a configured event day.');
    return markPresent(tx, person, day.id, 'ROOT', null, audit, now);
  });
}

async function assertIssuer(
  tx: PrismaTransactionClient,
  issuerId: string,
  dayId: string,
): Promise<Person> {
  const issuer = await tx.volunteer.findUnique({ where: { id: issuerId } });
  const present = await tx.attendance.findUnique({
    where: { volunteerId_eventDayId: { volunteerId: issuerId, eventDayId: dayId } },
  });
  if (
    !env.ATTENDANCE_ROOT_EMAIL ||
    !issuer?.active ||
    issuer.role === 'VOLUNTEER' ||
    !present ||
    (present.method === 'ROOT' && !isRoot(issuer))
  ) {
    throw new ForbiddenError(
      'The verifier must be an active admin or exco with verified attendance today.',
    );
  }
  if (!isRoot(issuer)) {
    const root = present.verifiedById
      ? await tx.volunteer.findUnique({ where: { id: present.verifiedById } })
      : null;
    if (!root || !isRoot(root))
      throw new ForbiddenError(
        'Excos must first verify attendance through the current root admin.',
      );
  }
  return issuer;
}

export async function issueChallenge(
  volunteerId: string,
  audit: AuditContext,
): Promise<AttendanceChallenge> {
  return prisma.$transaction(async (tx) => {
    await lockPerson(tx, volunteerId);
    const now = new Date();
    const day = await tx.eventDay.findUnique({
      where: { date: eventDayAnchor(singaporeDateString(now)) },
    });
    if (!day) throw new ForbiddenError('Today is not a configured event day.');
    await assertIssuer(tx, volunteerId, day.id);
    const id = randomUUID();
    const pin = randomInt(0, 10_000_000_000).toString().padStart(10, '0');
    const expiresAt = new Date(now.getTime() + ATTENDANCE_TTL_MS);
    // Rotating immediately invalidates both the previous QR and previous PIN.
    await tx.attendanceChallenge.deleteMany({
      where: { issuerId: volunteerId, eventDayId: day.id },
    });
    await tx.attendanceChallenge.create({
      data: {
        id,
        issuerId: volunteerId,
        eventDayId: day.id,
        pinHash: hashPin(pin),
        campusNetwork: onCampus(audit.ip),
        expiresAt,
      },
    });
    await writeAudit(tx, {
      ...audit,
      action: 'attendance.challenge',
      entityType: 'AttendanceChallenge',
      entityId: id,
      after: { eventDayId: day.id, expiresAt: expiresAt.toISOString() },
    });
    return {
      token: await signAttendanceToken(id, volunteerId, day.id, now),
      pin,
      expiresAt: expiresAt.toISOString(),
      serverTime: now.toISOString(),
      qrEnabled: onCampus(audit.ip),
    };
  });
}

export async function submitAttendance(
  volunteerId: string,
  proof: AttendanceProof,
  audit: AuditContext,
): Promise<AttendanceRecord> {
  const result = await prisma.$transaction(async (tx) => {
    await lockPerson(tx, volunteerId);
    const now = new Date();
    const person = await tx.volunteer.findUniqueOrThrow({ where: { id: volunteerId } });
    const day = await tx.eventDay.findUnique({
      where: { date: eventDayAnchor(singaporeDateString(now)) },
    });
    if (!person.active || !day)
      throw new ForbiddenError('Attendance is unavailable for this account or day.');
    const existing = await tx.attendance.findUnique({
      where: { volunteerId_eventDayId: { volunteerId, eventDayId: day.id } },
      include: { verifiedBy: true },
    });
    if (existing)
      return {
        attendance: await markPresent(
          tx,
          person,
          day.id,
          existing.method,
          existing.verifiedById,
          audit,
          now,
        ),
      };
    const attempts = await tx.attendanceAttempt.findUnique({ where: { volunteerId } });
    const sameWindow =
      attempts && now.getTime() - attempts.windowStart.getTime() < ATTENDANCE_TTL_MS;
    if (sameWindow && attempts.attempts >= 5)
      return {
        error: new RateLimitedError(
          'Too many attendance attempts. Wait five minutes before trying again.',
        ),
      };
    await tx.attendanceAttempt.upsert({
      where: { volunteerId },
      create: { volunteerId, windowStart: now, attempts: 1 },
      update: sameWindow ? { attempts: { increment: 1 } } : { windowStart: now, attempts: 1 },
    });
    // Return validation errors from the transaction so failed attempts persist.
    try {
      const claims = proof.method === 'QR' ? await verifyAttendanceToken(proof.token, now) : null;
      const challenge = await tx.attendanceChallenge.findUnique({
        where: claims
          ? { id: claims.id }
          : { pinHash: hashPin(proof.method === 'PIN' ? proof.pin : '') },
      });
      if (
        !challenge ||
        challenge.expiresAt <= now ||
        challenge.eventDayId !== day.id ||
        (claims && (claims.issuerId !== challenge.issuerId || claims.eventDayId !== day.id))
      ) {
        throw new ForbiddenError(
          'This attendance code is invalid or expired. Ask for a fresh code.',
        );
      }
      const issuer = await assertIssuer(tx, challenge.issuerId, day.id);
      if (issuer.id === volunteerId)
        throw new ForbiddenError('You cannot verify your own attendance.');
      if (person.role !== 'VOLUNTEER' && !isRoot(issuer))
        throw new ForbiddenError('Excos must scan the root admin’s QR or enter their PIN.');
      if (proof.method === 'QR' && (!challenge.campusNetwork || !onCampus(audit.ip))) {
        throw new ForbiddenError(
          'Both phones must use the configured SP network for QR attendance. Ask your verifier for their secondary PIN instead.',
        );
      }
      return {
        attendance: await markPresent(tx, person, day.id, proof.method, issuer.id, audit, now),
      };
    } catch (error) {
      if (error instanceof AppError) return { error };
      throw error;
    }
  });
  if (result.error) throw result.error;
  return result.attendance;
}
