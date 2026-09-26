import type { ShiftAssignmentRecord, VolunteerRecord } from '@spoh/shared';
import type { Prisma, Volunteer } from '../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../lib/prisma.js';

/**
 * Data access for the committee roster.
 *
 * This is the one schema holding names, emails and phone numbers. That is
 * ordinary — it is our own team, not visitors — but it lives apart from every
 * capture model and is archived once the post-event report is signed off
 * (PRODUCT_BRIEF §0.2).
 */

export function toVolunteerRecord(volunteer: Volunteer): VolunteerRecord {
  return {
    id: volunteer.id,
    displayName: volunteer.displayName,
    email: volunteer.email,
    phone: volunteer.phone,
    role: volunteer.role,
    portfolio: volunteer.portfolio,
    reportsToId: volunteer.reportsToId,
    active: volunteer.active,
    createdAt: volunteer.createdAt.toISOString(),
  };
}

export async function findVolunteerByEmail(
  email: string,
  tx: PrismaTransactionClient = prisma,
): Promise<Volunteer | null> {
  return tx.volunteer.findUnique({ where: { email } });
}

export async function upsertVolunteer(
  tx: PrismaTransactionClient,
  data: {
    cognitoSub: string;
    displayName: string;
    email: string;
    phone?: string | null;
    role: Prisma.VolunteerUncheckedCreateInput['role'];
    portfolio?: string | null;
    reportsToId?: string | null;
  },
): Promise<{ volunteer: Volunteer; created: boolean }> {
  const existing = await tx.volunteer.findUnique({ where: { email: data.email } });

  if (existing) {
    const volunteer = await tx.volunteer.update({
      where: { id: existing.id },
      data: {
        displayName: data.displayName,
        phone: data.phone ?? existing.phone,
        role: data.role,
        portfolio: data.portfolio ?? existing.portfolio,
        reportsToId: data.reportsToId ?? existing.reportsToId,
      },
    });
    return { volunteer, created: false };
  }

  const volunteer = await tx.volunteer.create({
    data: {
      cognitoSub: data.cognitoSub,
      displayName: data.displayName,
      email: data.email,
      phone: data.phone ?? null,
      role: data.role,
      portfolio: data.portfolio ?? null,
      reportsToId: data.reportsToId ?? null,
    },
  });

  return { volunteer, created: true };
}

const assignmentInclude = {
  volunteer: { select: { displayName: true, phone: true } },
  station: { select: { name: true } },
  eventDay: { select: { date: true } },
} satisfies Prisma.ShiftAssignmentInclude;

export type AssignmentWithNames = Prisma.ShiftAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

export function toAssignmentRecord(row: AssignmentWithNames): ShiftAssignmentRecord {
  return {
    id: row.id,
    volunteerId: row.volunteerId,
    volunteerName: row.volunteer.displayName,
    volunteerPhone: row.volunteer.phone,
    stationId: row.stationId,
    stationName: row.station.name,
    eventDayId: row.eventDayId,
    date: row.eventDay.date.toISOString().slice(0, 10),
    block: row.block,
    roleLabel: row.roleLabel,
    checkedInAt: row.checkedInAt?.toISOString() ?? null,
    checkedOutAt: row.checkedOutAt?.toISOString() ?? null,
  };
}

export async function listAssignmentsForStation(
  stationId: string,
  eventDayId?: string,
): Promise<AssignmentWithNames[]> {
  return prisma.shiftAssignment.findMany({
    where: { stationId, ...(eventDayId ? { eventDayId } : {}) },
    include: assignmentInclude,
    orderBy: [{ eventDay: { date: 'asc' } }, { block: 'asc' }, { roleLabel: 'asc' }],
  });
}

/**
 * Upsert an assignment. The unique key is (volunteer, day, block) — one person
 * cannot be in two places in the same block, which is exactly the constraint
 * that makes a re-run of the roster import safe.
 */
export async function upsertAssignment(
  tx: PrismaTransactionClient,
  data: {
    volunteerId: string;
    stationId: string;
    eventDayId: string;
    block: Prisma.ShiftAssignmentUncheckedCreateInput['block'];
    roleLabel: string;
  },
): Promise<{ created: boolean }> {
  const existing = await tx.shiftAssignment.findUnique({
    where: {
      volunteerId_eventDayId_block: {
        volunteerId: data.volunteerId,
        eventDayId: data.eventDayId,
        block: data.block,
      },
    },
    select: { id: true },
  });

  if (existing) {
    await tx.shiftAssignment.update({
      where: { id: existing.id },
      data: { stationId: data.stationId, roleLabel: data.roleLabel },
    });
    return { created: false };
  }

  await tx.shiftAssignment.create({ data });
  return { created: true };
}

export async function findEventDayByDate(
  tx: PrismaTransactionClient,
  date: Date,
): Promise<{ id: string } | null> {
  return tx.eventDay.findUnique({ where: { date }, select: { id: true } });
}

export async function findStationByCodeTx(
  tx: PrismaTransactionClient,
  code: string,
): Promise<{ id: string } | null> {
  return tx.station.findUnique({ where: { code }, select: { id: true } });
}
