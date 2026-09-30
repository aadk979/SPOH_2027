import { capabilitiesForRole, type MeResponse } from '@spoh/shared';
import { NotFoundError } from '../../../platform/errors/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { toMyAssignment } from '../data/mappers.js';
import {
  buildEscalationChain,
  findRunningAssignmentIds,
  findVolunteerById,
  listAssignmentsForVolunteer,
} from '../data/repo.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { runningShifts } from '../../../platform/event/runningShifts.js';
import { getEventSummary } from '../../event/index.js';

/**
 * `GET /me` is the client's boot call. It returns everything the role-scoped
 * home screen needs in one payload (BUILD_PLAN §9.3) — identity, capabilities,
 * today's posting and the escalation chain — because a volunteer opening the
 * app at 09:25 on a congested network should not need four round trips before
 * the screen is usable.
 */
export async function getMe(
  scope: EventScope,
  volunteerId: string,
  clock: Clock = systemClock,
): Promise<MeResponse> {
  const volunteer = await findVolunteerById(scope, volunteerId);
  if (!volunteer) throw new NotFoundError('Volunteer');

  const now = clock.now();
  const [event, assignments, escalationChain, running] = await Promise.all([
    getEventSummary(scope),
    listAssignmentsForVolunteer(scope, volunteerId),
    buildEscalationChain(scope, volunteer.reportsToMembershipId),
    findRunningAssignmentIds(scope, { volunteerId, running: await runningShifts(scope, now) }),
  ]);
  const currentAssignment = assignments.find((a) => running.has(a.id)) ?? null;

  return {
    volunteer: {
      id: volunteer.id,
      displayName: volunteer.displayName,
      role: volunteer.role,
      portfolio: volunteer.portfolio,
      active: volunteer.active,
    },
    event,
    capabilities: capabilitiesForRole(volunteer.role),
    currentAssignment: currentAssignment ? toMyAssignment(currentAssignment) : null,
    upcomingAssignments: assignments.map(toMyAssignment),
    escalationChain: escalationChain.map((person) => ({
      id: person.id,
      displayName: person.displayName,
      role: person.role,
      phone: person.phone,
      portfolio: person.portfolio,
    })),
    serverTime: now.toISOString(),
  };
}
