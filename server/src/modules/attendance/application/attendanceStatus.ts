import type { AttendanceStatus } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import { ForbiddenError } from '../../../platform/errors/index.js';
import { eventToday } from '../../../platform/event/today.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { toAttendanceRecord } from '../data/mappers.js';
import { findAttendance, findEventDayOn } from '../data/repo.js';
import { requireVolunteer } from './requireVolunteer.js';
import { assertActiveAccount, isRoot } from '../domain/attendanceRules.js';
import {
  campusCidrs,
  onCampus,
  rootMembershipId,
} from '../../../platform/event/attendanceAuthority.js';
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
    requireVolunteer(prisma, scope, volunteerId),
    findEventDayOn(prisma, scope, today),
  ]);
  const [configuredRoot, cidrs] = await Promise.all([rootMembershipId(scope), campusCidrs(scope)]);
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
    configured: Boolean(configuredRoot),
    isRoot: isRoot(person, configuredRoot),
    isExco: person.role !== 'VOLUNTEER',
    onCampusNetwork: onCampus(ip, cidrs),
    networkConfigured: cidrs.length > 0,
    attendance: attendance ? toAttendanceRecord(attendance) : null,
    canIssue,
    serverTime: now.toISOString(),
  };
}
