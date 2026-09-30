import type { AttendanceRecord } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import { ForbiddenError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { eventToday } from '../../../platform/event/today.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { findEventDayOn, findVolunteerOrThrow, lockPerson } from '../data/repo.js';
import { assertEventToday, isRoot } from '../domain/attendanceRules.js';
import { rootEmail } from './config.js';
import { markPresent } from './markPresent.js';

/** The root admin marks themself present, which opens the day's verification chain. */
export async function startAttendance(
  { volunteerId, scope, audit }: ActorContext,
  clock: Clock = systemClock,
): Promise<AttendanceRecord> {
  return prisma.$transaction(async (tx) => {
    await lockPerson(tx, volunteerId);
    const now = clock.now();
    const person = await findVolunteerOrThrow(tx, volunteerId);
    const day = await findEventDayOn(tx, scope, await eventToday(scope, now));
    if (!isRoot(person, rootEmail()))
      throw new ForbiddenError('Only the configured root admin can open attendance.');
    assertEventToday(day);
    return markPresent(
      tx,
      { scope, personId: person.id, dayId: day.id, method: 'ROOT', verifierId: null, now },
      audit,
    );
  });
}
