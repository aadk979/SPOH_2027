import type { AttendanceProof, AttendanceRecord } from '@spoh/shared';
import type { AuditContext } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { AppError, ForbiddenError, RateLimitedError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import {
  eventDayAnchor,
  singaporeDateString,
  systemClock,
  type Clock,
} from '../../../platform/time/index.js';
import {
  findAttendance,
  findAttempts,
  findChallenge,
  findEventDayOn,
  findVolunteerOrThrow,
  lockPerson,
  recordAttempt,
} from '../data/repo.js';
import {
  assertChallengeUsable,
  assertEventToday,
  assertMayVerify,
  attemptWindow,
  codeInvalid,
  type Person,
} from '../domain/attendanceRules.js';
import { onCampus, rootEmail } from './config.js';
import { assertIssuer } from './issuer.js';
import { markPresent } from './markPresent.js';
import { hashPin, verifyAttendanceToken } from './tokens.js';

type Outcome = { attendance: AttendanceRecord; error?: undefined } | { error: AppError };

/**
 * A volunteer proves presence with a verifier's QR or PIN. Rule failures are
 * returned from the transaction, not thrown, so the failed attempt is still
 * counted.
 */
export async function submitAttendance(
  proof: AttendanceProof,
  { volunteerId, audit }: ActorContext,
  clock: Clock = systemClock,
): Promise<AttendanceRecord> {
  const result = await prisma.$transaction(async (tx): Promise<Outcome> => {
    await lockPerson(tx, volunteerId);
    const now = clock.now();
    const person = await findVolunteerOrThrow(tx, volunteerId);
    const day = await findEventDayOn(tx, eventDayAnchor(singaporeDateString(now)));
    if (!person.active) throw new ForbiddenError('Attendance is unavailable for this account.');
    assertEventToday(day);
    const existing = await findAttendance(tx, volunteerId, day.id);
    if (existing) {
      const already = { method: existing.method, verifierId: existing.verifiedById };
      const presence = { personId: person.id, dayId: day.id, ...already, now };
      return { attendance: await markPresent(tx, presence, audit) };
    }
    const window = attemptWindow(await findAttempts(tx, volunteerId), now);
    if (window.exhausted)
      return {
        error: new RateLimitedError(
          'Too many attendance attempts. Wait five minutes before trying again.',
        ),
      };
    await recordAttempt(tx, volunteerId, { now, sameWindow: window.sameWindow });
    try {
      return { attendance: await verify(tx, { person, dayId: day.id, proof, audit, now }) };
    } catch (error) {
      if (error instanceof AppError) return { error };
      throw error;
    }
  });
  if (result.error) throw result.error;
  return result.attendance;
}

async function verify(
  tx: PrismaTransactionClient,
  input: { person: Person; dayId: string; proof: AttendanceProof; audit: AuditContext; now: Date },
): Promise<AttendanceRecord> {
  const { person, dayId, proof, audit, now } = input;
  const claims = proof.method === 'QR' ? await verifyAttendanceToken(proof.token, now) : null;
  const challenge = await findChallenge(
    tx,
    claims ? { id: claims.id } : { pinHash: hashPin(proof.method === 'PIN' ? proof.pin : '') },
  );
  assertChallengeUsable(challenge, claims, { dayId, now });
  const issuer = await assertIssuer(tx, challenge.issuerId, dayId).catch((error: unknown) => {
    // The verifier was deactivated or demoted since issuing: to the person
    // holding it, the code is no longer valid.
    if (error instanceof ForbiddenError) throw codeInvalid(error.message);
    throw error;
  });
  assertMayVerify({
    person,
    issuer,
    rootEmail: rootEmail(),
    method: proof.method,
    bothOnCampus: challenge.campusNetwork && onCampus(audit.ip),
  });
  const presence = { personId: person.id, dayId, method: proof.method, verifierId: issuer.id, now };
  return markPresent(tx, presence, audit);
}
