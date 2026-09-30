import type { AttendanceStatus } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import { ForbiddenError } from '../../../platform/errors/index.js';
import { eventToday } from '../../../platform/event/today.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { toAttendanceRecord } from '../data/mappers.js';
import { findAttendance, findEventDayOn, findVolunteerOrThrow } from '../data/repo.js';
import { assertActiveAccount, isRoot } from '../domain/attendanceRules.js';
import { networkConfigured, onCampus, rootEmail } from './config.js';
import { assertIssuer } from './issuer.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** What the attendance screen shows: today's day, the caller's record, what they may do. */
export async function attendanceStatus(
  viewer: { scope: EventScope; volunteerId: string; ip: string | undefined },
  clock: Clock = systemClock,
): Promise<AttendanceStatus> {
  const { scope, volunteerId, ip } = viewer;
  const now = clock.now();
  const today = await eventToday(scope, now);
  const [person, day] = await Promise.all([
    findVolunteerOrThrow(prisma, volunteerId),
    findEventDayOn(prisma, scope, today),
  ]);
  assertActiveAccount(person);
  const attendance = day
    ? await findAttendance(prisma, scope, { volunteerId, eventDayId: day.id })
    : null;
  let canIssue = false;
  if (day && attendance) {
    try {
      await assertIssuer(prisma, scope, { issuerId: volunteerId, dayId: day.id });
      canIssue = true;
    } catch (error) {
      if (!(error instanceof ForbiddenError)) throw error;
    }
  }
  return {
    eventDay: day ? { id: day.id, label: day.label } : null,
    configured: Boolean(rootEmail()),
    isRoot: isRoot(person, rootEmail()),
    isExco: person.role !== 'VOLUNTEER',
    onCampusNetwork: onCampus(ip),
    networkConfigured: networkConfigured(),
    attendance: attendance ? toAttendanceRecord(attendance) : null,
    canIssue,
    serverTime: now.toISOString(),
  };
}
