import {
  ERROR_CODES,
  ROLE_PRECEDENCE,
  type CommitteeRole,
  type CreateAssignmentRequest,
  type CreateEventDayRequest,
  type CreateGiftTypeRequest,
  type CreateStationRequest,
  type DeactivateVolunteerRequest,
  type EventDayRecord,
  type GiftTypeRecord,
  type ListVolunteersQuery,
  type ShiftAssignmentRecord,
  type StationSummary,
  type UpdateEventDayRequest,
  type UpdateGiftTypeRequest,
  type UpdateStationRequest,
  type UpdateVolunteerRequest,
  type VolunteerAdminRecord,
  type VolunteerMutationResponse,
} from '@spoh/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../platform/errors/index.js';
import { logger } from '../../platform/logger/index.js';
import { prisma } from '../../platform/db/client.js';
import { eventDayAnchor } from '../../platform/time/index.js';
import { writeAudit, type AuditContext } from '../../platform/audit/index.js';
import { invalidateVolunteerCache } from '../../platform/identity/index.js';
import { identityProvider } from '../identity/provider.js';
import { revokeAllForVolunteer } from '../auth/service.js';
import { toStationSummary } from '../station/data/repo.js';
import { toAssignmentRecord } from '../roster/repo.js';
import { toGiftTypeRecord } from '../gift/repo.js';

/**
 * Administration.
 *
 * ── The rules that are not obvious ──────────────────────────────────────────
 *
 * An administrator cannot edit their own role or deactivate themselves. Not
 * paternalism: a Chief who demotes themselves by mistake at 09:00 on 7 January
 * has locked the only account that can undo it, and there is no second Chief to
 * ask. The same reasoning makes the self-check cheap to enforce and expensive to
 * omit.
 *
 * An administrator cannot grant a role at or above their own, or act on someone
 * who already holds one. Otherwise `user.provision` is not a permission to
 * manage volunteers, it is a permission to become an Admin — a Chief could mint
 * an Admin account, sign into it, and hold every capability in the system.
 *
 * Both rules are enforced here rather than in the router, because they depend on
 * the target row and the capability middleware never reads it.
 */

/** True when `actor` is strictly more privileged than `subject`. */
function outranks(actor: CommitteeRole, subject: CommitteeRole): boolean {
  return ROLE_PRECEDENCE[actor] < ROLE_PRECEDENCE[subject];
}

export interface Actor {
  volunteerId: string;
  role: CommitteeRole;
}

// ─────────────────────────────────────────────────────────────
// VOLUNTEERS
// ─────────────────────────────────────────────────────────────

const adminSelect = {
  id: true,
  displayName: true,
  email: true,
  phone: true,
  role: true,
  portfolio: true,
  reportsToId: true,
  active: true,
  deactivatedAt: true,
  deactivatedReason: true,
  lastSeenAt: true,
  createdAt: true,
  reportsTo: { select: { displayName: true } },
  // Two facts an admin needs that the volunteer row does not carry: how much
  // work this person is actually holding, and whether any device could be
  // reached if it mattered.
  _count: { select: { shiftAssignments: true, pushSubscriptions: true } },
} satisfies Prisma.VolunteerSelect;

type AdminRow = Prisma.VolunteerGetPayload<{ select: typeof adminSelect }>;

function toAdminRecord(row: AdminRow): VolunteerAdminRecord {
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    phone: row.phone,
    role: row.role,
    portfolio: row.portfolio,
    reportsToId: row.reportsToId,
    reportsToName: row.reportsTo?.displayName ?? null,
    active: row.active,
    deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    deactivatedReason: row.deactivatedReason,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    assignmentCount: row._count.shiftAssignments,
    deviceCount: row._count.pushSubscriptions,
    // The question the week before the event is not "does this account exist"
    // but "has this person ever actually opened the app".
    hasSignedIn: row.lastSeenAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Nulls first on "last seen": the people who have never signed in are exactly
 * who you open this screen to find, so they belong at the top rather than
 * buried under everyone who has.
 */
const SORTS: Record<ListVolunteersQuery['sort'], Prisma.VolunteerOrderByWithRelationInput[]> = {
  name: [{ displayName: 'asc' }],
  role: [{ role: 'asc' }, { displayName: 'asc' }],
  lastSeen: [{ lastSeenAt: { sort: 'asc', nulls: 'first' } }, { displayName: 'asc' }],
  created: [{ createdAt: 'desc' }],
};

export async function listVolunteers(query: ListVolunteersQuery): Promise<{
  data: VolunteerAdminRecord[];
  nextCursor: string | null;
}> {
  const rows = await prisma.volunteer.findMany({
    where: {
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.q
        ? {
            OR: [
              { displayName: { contains: query.q, mode: 'insensitive' as const } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.stationId || query.eventDayId
        ? {
            shiftAssignments: {
              some: {
                ...(query.stationId ? { stationId: query.stationId } : {}),
                ...(query.eventDayId ? { eventDayId: query.eventDayId } : {}),
              },
            },
          }
        : {}),
    },
    select: adminSelect,
    orderBy: SORTS[query.sort],
    take: query.limit,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  return {
    data: rows.map((row) => toAdminRecord(row)),
    nextCursor: rows.length === query.limit ? (rows.at(-1)?.id ?? null) : null,
  };
}

export async function getVolunteer(id: string): Promise<VolunteerAdminRecord> {
  const row = await prisma.volunteer.findUnique({ where: { id }, select: adminSelect });
  if (!row) throw new NotFoundError('Volunteer');
  return toAdminRecord(row);
}

/** Load the target and apply the two escalation rules. */
async function loadTarget(id: string, actor: Actor, action: string): Promise<AdminRow> {
  const row = await prisma.volunteer.findUnique({ where: { id }, select: adminSelect });
  if (!row) throw new NotFoundError('Volunteer');

  if (row.id === actor.volunteerId) {
    throw new AppError(
      403,
      ERROR_CODES.SELF_MUTATION_DENIED,
      `You cannot ${action} your own account. Ask another administrator.`,
    );
  }

  if (!outranks(actor.role, row.role)) {
    throw new AppError(
      403,
      ERROR_CODES.ROLE_ESCALATION_DENIED,
      'You cannot change an account at or above your own level.',
    );
  }

  return row;
}

/**
 * Walk the reporting chain to make sure a proposed manager is not downstream of
 * the volunteer being edited.
 *
 * A cycle here is not a cosmetic problem: `GET /me` walks this chain to build
 * the escalation card, and a loop would spin until the request timed out — on
 * the boot call every volunteer makes.
 */
async function assertNoReportingCycle(volunteerId: string, managerId: string): Promise<void> {
  if (volunteerId === managerId) {
    throw new AppError(409, ERROR_CODES.REPORTING_CYCLE, 'Somebody cannot report to themselves.');
  }

  const seen = new Set<string>([volunteerId]);
  let cursor: string | null = managerId;

  // Bounded by the roster size; the seen-set makes it terminate on any
  // pre-existing loop rather than inheriting it.
  while (cursor) {
    if (seen.has(cursor)) {
      throw new AppError(
        409,
        ERROR_CODES.REPORTING_CYCLE,
        'That reporting line would form a loop.',
      );
    }
    seen.add(cursor);

    const next: { reportsToId: string | null } | null = await prisma.volunteer.findUnique({
      where: { id: cursor },
      select: { reportsToId: true },
    });
    cursor = next?.reportsToId ?? null;
  }
}

export async function updateVolunteer(
  id: string,
  patch: UpdateVolunteerRequest,
  actor: Actor,
  audit: AuditContext,
): Promise<VolunteerMutationResponse> {
  const target = await loadTarget(id, actor, 'edit');

  if (patch.role && !outranks(actor.role, patch.role)) {
    throw new AppError(
      403,
      ERROR_CODES.ROLE_ESCALATION_DENIED,
      'You cannot grant a role at or above your own.',
    );
  }

  if (patch.reportsToId) {
    const manager = await prisma.volunteer.findUnique({
      where: { id: patch.reportsToId },
      select: { id: true, active: true },
    });
    if (!manager?.active) throw new NotFoundError('Manager');
    await assertNoReportingCycle(id, patch.reportsToId);
  }

  const roleChanged = patch.role !== undefined && patch.role !== target.role;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.volunteer.update({
      where: { id },
      data: {
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone ?? null } : {}),
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.portfolio !== undefined ? { portfolio: patch.portfolio ?? null } : {}),
        ...(patch.reportsToId !== undefined ? { reportsToId: patch.reportsToId ?? null } : {}),
      },
      select: adminSelect,
    });

    await writeAudit(tx, {
      ...audit,
      action: 'user.update',
      entityType: 'Volunteer',
      entityId: id,
      before: {
        displayName: target.displayName,
        role: target.role,
        portfolio: target.portfolio,
        reportsToId: target.reportsToId,
      },
      after: { ...patch },
    });

    return row;
  });

  /**
   * A role change is a change to what this person may do, so their existing
   * sessions must not outlive it. The capability list is baked into the client
   * at sign-in and the access token lives up to its TTL; forcing a fresh sign-in
   * is the only way a demotion takes effect immediately.
   */
  let sessionsRevoked = 0;
  if (roleChanged) {
    sessionsRevoked = await revokeAllForVolunteer(id, 'role-changed');

    // Keep the identity provider's groups in step, so a Cognito-side view of
    // who is an IC does not drift from the roster.
    try {
      await identityProvider.ensureUser({
        email: updated.email,
        displayName: updated.displayName,
        role: updated.role,
      });
    } catch (error) {
      // The roster is authoritative for authorization, so this is a
      // reconciliation problem rather than a failed edit.
      logger.error(
        { err: error, volunteerId: id },
        'role changed on the roster but the identity provider group could not be updated',
      );
    }
  }

  invalidateVolunteerCache();

  return { volunteer: toAdminRecord(updated), sessionsRevoked, identityChanged: roleChanged };
}

/**
 * Withdraw access.
 *
 * Three things have to happen together or the account is only half locked out:
 * the roster row is flagged, every refresh session is revoked, and the identity
 * provider account is disabled. Skipping the middle one leaves the volunteer
 * signed in until their access token expires; skipping the last leaves them
 * able to open a fresh session.
 */
export async function deactivateVolunteer(
  id: string,
  request: DeactivateVolunteerRequest,
  actor: Actor,
  audit: AuditContext,
): Promise<VolunteerMutationResponse> {
  const target = await loadTarget(id, actor, 'deactivate');

  if (!target.active) {
    throw new ConflictError(ERROR_CODES.CONFLICT, 'That account is already deactivated');
  }

  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.volunteer.update({
      where: { id },
      data: { active: false, deactivatedAt: now, deactivatedReason: request.reason },
      select: adminSelect,
    });

    // A device that can no longer sign in should not keep receiving alerts
    // about an event it is locked out of.
    await tx.pushSubscription.deleteMany({ where: { volunteerId: id } });

    await writeAudit(tx, {
      ...audit,
      action: 'user.deactivate',
      entityType: 'Volunteer',
      entityId: id,
      before: { active: true },
      after: { active: false, reason: request.reason, disableIdentity: request.disableIdentity },
    });

    return row;
  });

  const sessionsRevoked = await revokeAllForVolunteer(id, 'deactivated');

  let identityChanged = false;
  if (request.disableIdentity) {
    try {
      await identityProvider.disableUser(target.email);
      identityChanged = true;
    } catch (error) {
      // The roster flag already blocks every request, so access is withdrawn
      // either way — but somebody needs to know the provider is out of step.
      logger.error(
        { err: error, volunteerId: id },
        'volunteer deactivated on the roster but the identity provider account could not be disabled',
      );
    }
  }

  invalidateVolunteerCache();

  return { volunteer: toAdminRecord(updated), sessionsRevoked, identityChanged };
}

export async function reactivateVolunteer(
  id: string,
  actor: Actor,
  audit: AuditContext,
): Promise<VolunteerMutationResponse> {
  const target = await loadTarget(id, actor, 'reactivate');

  if (target.active) {
    throw new ConflictError(ERROR_CODES.CONFLICT, 'That account is already active');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.volunteer.update({
      where: { id },
      data: { active: true, deactivatedAt: null, deactivatedReason: null },
      select: adminSelect,
    });

    await writeAudit(tx, {
      ...audit,
      action: 'user.reactivate',
      entityType: 'Volunteer',
      entityId: id,
      before: { active: false, reason: target.deactivatedReason },
      after: { active: true },
    });

    return row;
  });

  let identityChanged = false;
  try {
    await identityProvider.enableUser(target.email);
    identityChanged = true;
  } catch (error) {
    logger.error(
      { err: error, volunteerId: id },
      'volunteer reactivated on the roster but the identity provider account could not be re-enabled',
    );
  }

  invalidateVolunteerCache();

  // Sessions are deliberately not restored: the volunteer signs in again, which
  // is what proves they still hold the credential.
  return { volunteer: toAdminRecord(updated), sessionsRevoked: 0, identityChanged };
}

// ─────────────────────────────────────────────────────────────
// ASSIGNMENTS
// ─────────────────────────────────────────────────────────────

export async function createAssignment(
  request: CreateAssignmentRequest,
  audit: AuditContext,
): Promise<ShiftAssignmentRecord> {
  const [volunteer, station, eventDay] = await Promise.all([
    prisma.volunteer.findUnique({ where: { id: request.volunteerId }, select: { active: true } }),
    prisma.station.findUnique({ where: { id: request.stationId }, select: { active: true } }),
    prisma.eventDay.findUnique({ where: { id: request.eventDayId }, select: { id: true } }),
  ]);

  if (!volunteer?.active) throw new NotFoundError('Volunteer');
  if (!station?.active) throw new NotFoundError('Station');
  if (!eventDay) throw new NotFoundError('Event day');

  // The unique key is (volunteer, day, block): one person cannot be in two
  // places in the same block. Upsert rather than fail, because "move them to
  // the other station" is the operation an IC actually wants.
  const row = await prisma.$transaction(async (tx) => {
    const assignment = await tx.shiftAssignment.upsert({
      where: {
        volunteerId_eventDayId_block: {
          volunteerId: request.volunteerId,
          eventDayId: request.eventDayId,
          block: request.block,
        },
      },
      create: {
        volunteerId: request.volunteerId,
        stationId: request.stationId,
        eventDayId: request.eventDayId,
        block: request.block,
        roleLabel: request.roleLabel,
      },
      update: { stationId: request.stationId, roleLabel: request.roleLabel },
      include: {
        volunteer: { select: { displayName: true, phone: true } },
        station: { select: { name: true } },
        eventDay: { select: { date: true } },
      },
    });

    await writeAudit(tx, {
      ...audit,
      action: 'assignment.create',
      entityType: 'ShiftAssignment',
      entityId: assignment.id,
      after: {
        volunteerId: request.volunteerId,
        stationId: request.stationId,
        block: request.block,
      },
    });

    return assignment;
  });

  return toAssignmentRecord(row);
}

export async function deleteAssignment(id: string, audit: AuditContext): Promise<void> {
  const existing = await prisma.shiftAssignment.findUnique({
    where: { id },
    select: { id: true, volunteerId: true, stationId: true, block: true, checkedInAt: true },
  });

  if (!existing) throw new NotFoundError('Shift assignment');

  if (existing.checkedInAt) {
    // Deleting an assignment somebody worked would erase the attendance record
    // the post-event report counts. Correct the roster, do not rewrite history.
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'That volunteer has already checked in for this shift. Check them out instead of removing it.',
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.shiftAssignment.delete({ where: { id } });
    await writeAudit(tx, {
      ...audit,
      action: 'assignment.delete',
      entityType: 'ShiftAssignment',
      entityId: id,
      before: { ...existing },
    });
  });
}

// ─────────────────────────────────────────────────────────────
// STATIONS
// ─────────────────────────────────────────────────────────────

export async function createStation(
  request: CreateStationRequest,
  audit: AuditContext,
): Promise<StationSummary> {
  const existing = await prisma.station.findUnique({ where: { code: request.code } });
  if (existing) {
    throw new ConflictError(
      ERROR_CODES.STATION_CODE_TAKEN,
      `Station code ${request.code} is already in use by ${existing.name}`,
    );
  }

  const station = await prisma.$transaction(async (tx) => {
    const row = await tx.station.create({
      data: {
        code: request.code,
        name: request.name,
        kind: request.kind,
        courseCode: request.courseCode ?? null,
        floor: request.floor ?? null,
        countsEntry: request.countsEntry,
        issuesStamp: request.issuesStamp,
        sortOrder: request.sortOrder,
      },
    });

    await writeAudit(tx, {
      ...audit,
      action: 'station.create',
      entityType: 'Station',
      entityId: row.id,
      after: { code: row.code, name: row.name, kind: row.kind },
    });

    return row;
  });

  return toStationSummary(station);
}

export async function updateStation(
  id: string,
  patch: UpdateStationRequest,
  audit: AuditContext,
): Promise<StationSummary> {
  const existing = await prisma.station.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Station');

  /**
   * Turning off `issuesStamp` changes what "complete" means for every Mission
   * Card in the system, because completion is computed against the number of
   * stamping stations. Cards already marked complete keep their status; the
   * change is audited so a shifting completion rate has an explanation.
   */
  const station = await prisma.$transaction(async (tx) => {
    const row = await tx.station.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
        ...(patch.courseCode !== undefined ? { courseCode: patch.courseCode ?? null } : {}),
        ...(patch.floor !== undefined ? { floor: patch.floor ?? null } : {}),
        ...(patch.countsEntry !== undefined ? { countsEntry: patch.countsEntry } : {}),
        ...(patch.issuesStamp !== undefined ? { issuesStamp: patch.issuesStamp } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
    });

    await writeAudit(tx, {
      ...audit,
      action: 'station.update',
      entityType: 'Station',
      entityId: id,
      before: {
        name: existing.name,
        countsEntry: existing.countsEntry,
        issuesStamp: existing.issuesStamp,
        active: existing.active,
      },
      after: { ...patch },
    });

    return row;
  });

  return toStationSummary(station);
}

// ─────────────────────────────────────────────────────────────
// EVENT DAYS
// ─────────────────────────────────────────────────────────────

export async function listEventDays(): Promise<EventDayRecord[]> {
  const rows = await prisma.eventDay.findMany({
    orderBy: { date: 'asc' },
    include: { _count: { select: { shiftAssignments: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    label: row.label,
    isPublicDay: row.isPublicDay,
    isTourDay: row.isTourDay,
    assignmentCount: row._count.shiftAssignments,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createEventDay(
  request: CreateEventDayRequest,
  audit: AuditContext,
): Promise<EventDayRecord> {
  const date = eventDayAnchor(request.date);

  const existing = await prisma.eventDay.findUnique({ where: { date } });
  if (existing) {
    throw new ConflictError(
      ERROR_CODES.EVENT_DAY_EXISTS,
      `${request.date} is already configured as "${existing.label}"`,
    );
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.eventDay.create({
      data: {
        date,
        label: request.label,
        isPublicDay: request.isPublicDay,
        isTourDay: request.isTourDay,
      },
      include: { _count: { select: { shiftAssignments: true } } },
    });

    await writeAudit(tx, {
      ...audit,
      action: 'eventDay.create',
      entityType: 'EventDay',
      entityId: created.id,
      after: { date: request.date, label: request.label },
    });

    return created;
  });

  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    label: row.label,
    isPublicDay: row.isPublicDay,
    isTourDay: row.isTourDay,
    assignmentCount: row._count.shiftAssignments,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function updateEventDay(
  id: string,
  patch: UpdateEventDayRequest,
  audit: AuditContext,
): Promise<EventDayRecord> {
  const existing = await prisma.eventDay.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Event day');

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.eventDay.update({
      where: { id },
      data: {
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.isPublicDay !== undefined ? { isPublicDay: patch.isPublicDay } : {}),
        ...(patch.isTourDay !== undefined ? { isTourDay: patch.isTourDay } : {}),
      },
      include: { _count: { select: { shiftAssignments: true } } },
    });

    await writeAudit(tx, {
      ...audit,
      action: 'eventDay.update',
      entityType: 'EventDay',
      entityId: id,
      before: { label: existing.label },
      after: { ...patch },
    });

    return updated;
  });

  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    label: row.label,
    isPublicDay: row.isPublicDay,
    isTourDay: row.isTourDay,
    assignmentCount: row._count.shiftAssignments,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// GIFT TYPES
// ─────────────────────────────────────────────────────────────

export async function createGiftType(
  request: CreateGiftTypeRequest,
  audit: AuditContext,
): Promise<GiftTypeRecord> {
  const existing = await prisma.giftType.findUnique({ where: { name: request.name } });
  if (existing) {
    throw new ConflictError(ERROR_CODES.GIFT_TYPE_EXISTS, `${request.name} already exists`);
  }

  const gift = await prisma.$transaction(async (tx) => {
    const row = await tx.giftType.create({
      data: {
        name: request.name,
        initialStock: request.initialStock,
        lowStockThreshold: request.lowStockThreshold,
      },
    });

    await writeAudit(tx, {
      ...audit,
      action: 'giftType.create',
      entityType: 'GiftType',
      entityId: row.id,
      after: { name: row.name, initialStock: row.initialStock },
    });

    return row;
  });

  return toGiftTypeRecord(gift, { redeemed: 0, adjustment: 0 });
}

export async function updateGiftType(
  id: string,
  patch: UpdateGiftTypeRequest,
  audit: AuditContext,
): Promise<GiftTypeRecord> {
  const existing = await prisma.giftType.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Gift type');

  const gift = await prisma.$transaction(async (tx) => {
    const row = await tx.giftType.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.lowStockThreshold !== undefined
          ? { lowStockThreshold: patch.lowStockThreshold }
          : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
    });

    await writeAudit(tx, {
      ...audit,
      action: 'giftType.update',
      entityType: 'GiftType',
      entityId: id,
      before: {
        name: existing.name,
        lowStockThreshold: existing.lowStockThreshold,
        active: existing.active,
      },
      after: { ...patch },
    });

    return row;
  });

  const totals = await prisma.giftRedemption.aggregate({
    where: { giftTypeId: id, voided: false },
    _count: { _all: true },
  });
  const adjustments = await prisma.giftStockAdjustment.aggregate({
    where: { giftTypeId: id },
    _sum: { delta: true },
  });

  return toGiftTypeRecord(gift, {
    redeemed: totals._count._all,
    adjustment: adjustments._sum.delta ?? 0,
  });
}

/** Guard used by the router so a forbidden action never reaches the service. */
export function assertCanActOn(actor: Actor, targetRole: CommitteeRole): void {
  if (!outranks(actor.role, targetRole)) {
    throw new ForbiddenError('You cannot act on an account at or above your own level');
  }
}
