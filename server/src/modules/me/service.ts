import { capabilitiesForRole, ERROR_CODES, type MeResponse, type MyAssignment } from '@spoh/shared';
import { AppError, ForbiddenError, NotFoundError } from '../../platform/errors/index.js';
import { writeAudit, type AuditContext } from '../../platform/audit/index.js';
import { prisma } from '../../platform/db/client.js';
import {
  activeShiftBlocks,
  eventDayAnchor,
  singaporeDateString,
} from '../../platform/time/index.js';
import { toStationSummary } from '../station/repo.js';
import {
  buildEscalationChain,
  findAssignmentById,
  findVolunteerById,
  listAssignmentsForVolunteer,
  setAssignmentCheckIn,
  setAssignmentCheckOut,
  type AssignmentWithContext,
} from './repo.js';

/**
 * `GET /me` is the client's boot call. It returns everything the role-scoped
 * home screen needs in one payload (BUILD_PLAN §9.3) — identity, capabilities,
 * today's posting and the escalation chain — because a volunteer opening the
 * app at 09:25 on a congested network should not need four round trips before
 * the screen is usable.
 */
export async function getMe(volunteerId: string): Promise<MeResponse> {
  const volunteer = await findVolunteerById(volunteerId);
  if (!volunteer) throw new NotFoundError('Volunteer');

  const assignments = await listAssignmentsForVolunteer(volunteerId);
  const escalationChain = await buildEscalationChain(volunteer.reportsToId);

  const now = new Date();
  const today = eventDayAnchor(singaporeDateString(now));
  const blocks = activeShiftBlocks(now);

  const currentAssignment =
    assignments.find(
      (a) => a.eventDay.date.getTime() === today.getTime() && blocks.includes(a.block),
    ) ?? null;

  return {
    volunteer: {
      id: volunteer.id,
      displayName: volunteer.displayName,
      role: volunteer.role,
      portfolio: volunteer.portfolio,
      active: volunteer.active,
    },
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

export function toMyAssignment(assignment: AssignmentWithContext): MyAssignment {
  return {
    id: assignment.id,
    eventDayId: assignment.eventDayId,
    date: assignment.eventDay.date.toISOString().slice(0, 10),
    dayLabel: assignment.eventDay.label,
    block: assignment.block,
    roleLabel: assignment.roleLabel,
    station: toStationSummary(assignment.station),
    checkedInAt: assignment.checkedInAt?.toISOString() ?? null,
    checkedOutAt: assignment.checkedOutAt?.toISOString() ?? null,
  };
}

/**
 * Shift check-in. Gives Lead Facilitators live attendance instead of counting
 * heads (PRODUCT_BRIEF §6.1).
 */
export async function checkIn(
  volunteerId: string,
  assignmentId: string,
  audit: AuditContext,
): Promise<MyAssignment> {
  const assignment = await loadOwnAssignment(volunteerId, assignmentId);

  if (assignment.checkedInAt) {
    throw new AppError(
      409,
      ERROR_CODES.ALREADY_CHECKED_IN,
      'You are already checked in for this shift',
    );
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const attendance = await tx.attendance.findUnique({
      where: { volunteerId_eventDayId: { volunteerId, eventDayId: assignment.eventDayId } },
    });
    if (
      !attendance ||
      assignment.eventDay.date.getTime() !== eventDayAnchor(singaporeDateString(now)).getTime() ||
      !activeShiftBlocks(now).includes(assignment.block)
    ) {
      throw new ForbiddenError(
        'Submit verified attendance for today before checking into a current shift.',
      );
    }
    const changed = await tx.shiftAssignment.updateMany({
      where: { id: assignmentId, volunteerId, checkedInAt: null },
      data: { checkedInAt: now },
    });
    if (!changed.count)
      throw new ForbiddenError('This shift has changed. Refresh your shift list.');
    const updated = await tx.shiftAssignment.findUniqueOrThrow({
      where: { id: assignmentId },
      include: { station: true, eventDay: true },
    });

    await writeAudit(tx, {
      ...audit,
      action: 'shift.checkIn',
      entityType: 'ShiftAssignment',
      entityId: assignmentId,
      after: { checkedInAt: now.toISOString() },
    });

    return toMyAssignment(updated);
  });
}

export async function checkOut(
  volunteerId: string,
  assignmentId: string,
  audit: AuditContext,
): Promise<MyAssignment> {
  const assignment = await loadOwnAssignment(volunteerId, assignmentId);

  if (!assignment.checkedInAt) {
    throw new AppError(
      409,
      ERROR_CODES.NOT_CHECKED_IN,
      'You cannot check out of a shift you never checked into',
    );
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.shiftAssignment.update({
      where: { id: assignmentId },
      data: { checkedOutAt: now },
      include: { station: true, eventDay: true },
    });

    await writeAudit(tx, {
      ...audit,
      action: 'shift.checkOut',
      entityType: 'ShiftAssignment',
      entityId: assignmentId,
      after: { checkedOutAt: now.toISOString() },
    });

    return toMyAssignment(updated);
  });
}

/**
 * You may only check yourself in or out. Verified against the row rather than
 * trusting the id in the request — otherwise any volunteer could mark any
 * other volunteer present (IDOR, BUILD_PLAN §8.5).
 */
async function loadOwnAssignment(
  volunteerId: string,
  assignmentId: string,
): Promise<AssignmentWithContext> {
  const assignment = await findAssignmentById(assignmentId);
  if (!assignment) throw new NotFoundError('Shift assignment');
  if (assignment.volunteerId !== volunteerId) {
    throw new ForbiddenError('You can only check in or out of your own shift');
  }
  return assignment;
}

// Re-exported so the repo helpers stay available to the roster module without
// it reaching across into another module's internals.
export { setAssignmentCheckIn, setAssignmentCheckOut };
