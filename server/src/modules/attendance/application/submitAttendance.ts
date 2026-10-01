import type { AttendanceProof, AttendanceRecord } from '@spoh/shared';
import type { AuditContext } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { AppError, ForbiddenError, RateLimitedError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { eventToday } from '../../../platform/event/today.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import {
  findAttendance,
  findAttempts,
  findChallenge,
  findEventDayOn,
  lockPerson,
  recordAttempt,
} from '../data/repo.js';
import { requireVolunteer } from './requireVolunteer.js';
import {
  assertChallengeUsable,
  assertEventToday,
  assertMayVerify,
  attemptWindow,
  codeInvalid,
  type Person,
} from '../domain/attendanceRules.js';
import { campusCidrs, onCampus, rootMembershipId } from './config.js';
import { assertIssuer } from './issuer.js';
import { markPresent } from './markPresent.js';
import { hashPin, verifyAttendanceToken } from './tokens.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

type Outcome = { attendance: AttendanceRecord; error?: undefined } | { error: AppError };

/**
 * A volunteer proves presence with a verifier's QR or PIN. Rule failures are
 * returned from the transaction, not thrown, so the failed attempt is still
 * counted.
 */
export async function submitAttendance(
  proof: AttendanceProof,
  { volunteerId, scope, audit }: ActorContext,
  clock: Clock = systemClock,
): Promise<AttendanceRecord> {
  const result = await prisma.$transaction(async (tx): Promise<Outcome> => {
    await lockPerson(tx, volunteerId);
    const now = clock.now();
    const person = await requireVolunteer(tx, scope, volunteerId);
    const day = await findEventDayOn(tx, scope, await eventToday(scope, now));
    if (!person.active) throw new ForbiddenError('Attendance is unavailable for this account.');
    assertEventToday(day);
    const existing = await findAttendance(tx, scope, { volunteerId, eventDayId: day.id });
    if (existing) {
      const already = { method: existing.method, verifierId: existing.verifiedById };
      const presence = { scope, personId: person.id, dayId: day.id, ...already, now };
      return { attendance: await markPresent(tx, presence, audit) };
    }
    const window = attemptWindow(await findAttempts(tx, scope, volunteerId), now);
    if (window.exhausted)
      return {
        error: new RateLimitedError(
          'Too many attendance attempts. Wait five minutes before trying again.',
        ),
      };
    await recordAttempt(tx, scope, { volunteerId, now, sameWindow: window.sameWindow });
    try {
      return {
        attendance: await verify(tx, { scope, person, dayId: day.id, proof, audit, now }),
      };
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
  input: {
    scope: EventScope;
    person: Person;
    dayId: string;
    proof: AttendanceProof;
    audit: AuditContext;
    now: Date;
  },
): Promise<AttendanceRecord> {
  const { scope, person, dayId, proof, audit, now } = input;
  const claims = proof.method === 'QR' ? await verifyAttendanceToken(proof.token, now) : null;
  const challenge = await findChallenge(
    tx,
    scope,
    claims ? { id: claims.id } : { pinHash: hashPin(proof.method === 'PIN' ? proof.pin : '') },
  );
  assertChallengeUsable(challenge, claims, { dayId, now });
  const issuer = await assertIssuer(tx, scope, { issuerId: challenge.issuerId, dayId }).catch(
    (error: unknown) => {
      // The verifier was deactivated or demoted since issuing: to the person
      // holding it, the code is no longer valid.
      if (error instanceof ForbiddenError) throw codeInvalid(error.message);
      throw error;
    },
  );
  const cidrs = await campusCidrs(scope, tx);
  assertMayVerify({
    person,
    issuer,
    rootMembershipId: await rootMembershipId(scope, tx),
    method: proof.method,
    bothOnCampus: challenge.campusNetwork && onCampus(audit.ip, cidrs),
  });
  const presence = {
    scope,
    personId: person.id,
    dayId,
    method: proof.method,
    verifierId: issuer.id,
    now,
  };
  return markPresent(tx, presence, audit);
}
