import { randomInt, randomUUID } from 'node:crypto';
import type { AttendanceChallenge } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import {
  eventDayAnchor,
  singaporeDateString,
  systemClock,
  type Clock,
} from '../../../platform/time/index.js';
import { findEventDayOn, lockPerson, replaceChallenge } from '../data/repo.js';
import { ATTENDANCE_TTL_MS, assertEventToday } from '../domain/attendanceRules.js';
import { onCampus } from './config.js';
import { assertIssuer } from './issuer.js';
import { hashPin, signAttendanceToken } from './tokens.js';

/** A fresh QR token and PIN for a verifier; the previous pair stops working. */
export async function issueChallenge(
  { volunteerId, audit }: ActorContext,
  clock: Clock = systemClock,
): Promise<AttendanceChallenge> {
  return prisma.$transaction(async (tx) => {
    await lockPerson(tx, volunteerId);
    const now = clock.now();
    const day = await findEventDayOn(tx, eventDayAnchor(singaporeDateString(now)));
    assertEventToday(day);
    await assertIssuer(tx, volunteerId, day.id);
    const id = randomUUID();
    const pin = randomInt(0, 10_000_000_000).toString().padStart(10, '0');
    const expiresAt = new Date(now.getTime() + ATTENDANCE_TTL_MS);
    await replaceChallenge(tx, {
      id,
      issuerId: volunteerId,
      eventDayId: day.id,
      pinHash: hashPin(pin),
      campusNetwork: onCampus(audit.ip),
      expiresAt,
    });
    await writeAudit(tx, {
      ...audit,
      action: 'attendance.challenge',
      entityType: 'AttendanceChallenge',
      entityId: id,
      after: { eventDayId: day.id, expiresAt: expiresAt.toISOString() },
    });
    return {
      token: await signAttendanceToken({ id, issuerId: volunteerId, eventDayId: day.id }, now),
      pin,
      expiresAt: expiresAt.toISOString(),
      serverTime: now.toISOString(),
      qrEnabled: onCampus(audit.ip),
    };
  });
}
