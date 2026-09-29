import type { Prisma, Person } from '../../../generated/prisma/client.js';

// The roster still speaks of volunteers; the row is a Person since P09.3.
type Volunteer = Person;
export type { Volunteer };
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { mirrorMembership } from '../../../platform/db/membershipMirror.js';

/**
 * Data access for the committee roster.
 *
 * This is the one schema holding names, emails and phone numbers. That is
 * ordinary — it is our own team, not visitors — but it lives apart from every
 * capture model and is archived once the post-event report is signed off
 * (PRODUCT_BRIEF §0.2).
 */

export async function findVolunteerByEmail(
  email: string,
  tx: PrismaTransactionClient = prisma,
): Promise<Volunteer | null> {
  return tx.person.findUnique({ where: { email } });
}

export async function upsertVolunteer(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: {
    cognitoSub: string;
    displayName: string;
    email: string;
    phone?: string | null;
    role: Prisma.PersonUncheckedCreateInput['role'];
    portfolio?: string | null;
    reportsToId?: string | null;
  },
): Promise<{ volunteer: Volunteer; created: boolean }> {
  const existing = await tx.person.findUnique({ where: { email: data.email } });

  if (existing) {
    const volunteer = await tx.person.update({
      where: { id: existing.id },
      data: {
        displayName: data.displayName,
        phone: data.phone ?? existing.phone,
        role: data.role,
        portfolio: data.portfolio ?? existing.portfolio,
        reportsToId: data.reportsToId ?? existing.reportsToId,
      },
    });
    await mirrorMembership(tx, scope, volunteer.id);
    return { volunteer, created: false };
  }

  const volunteer = await tx.person.create({
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
  await mirrorMembership(tx, scope, volunteer.id);

  return { volunteer, created: true };
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

/** The accounts with these emails, by email. */
export async function findVolunteersByEmails(
  emails: readonly string[],
): Promise<Map<string, Volunteer>> {
  if (emails.length === 0) return new Map();
  const rows = await prisma.person.findMany({ where: { email: { in: [...emails] } } });
  return new Map(rows.map((row) => [row.email, row]));
}

/** Every event day, keyed by its date (YYYY-MM-DD), for matching import rows. */
export async function eventDayIdsByDate(): Promise<Map<string, string>> {
  const days = await prisma.eventDay.findMany({ select: { id: true, date: true } });
  return new Map(days.map((day) => [day.date.toISOString().slice(0, 10), day.id]));
}

/** Every station, keyed by its code, for matching import rows. */
export async function stationIdsByCode(): Promise<Map<string, string>> {
  const stations = await prisma.station.findMany({ select: { id: true, code: true } });
  return new Map(stations.map((station) => [station.code, station.id]));
}

/** The (day, block) slots these volunteers already hold, as volunteerId|eventDayId|block. */
export async function existingSlots(volunteerIds: readonly string[]): Promise<Set<string>> {
  if (volunteerIds.length === 0) return new Set();
  const rows = await prisma.shiftAssignment.findMany({
    where: { volunteerId: { in: [...volunteerIds] } },
    select: { volunteerId: true, eventDayId: true, block: true },
  });
  return new Set(rows.map((row) => `${row.volunteerId}|${row.eventDayId}|${row.block}`));
}

export async function setManager(
  tx: PrismaTransactionClient,
  scope: EventScope,
  link: { volunteerId: string; managerId: string },
): Promise<void> {
  await tx.person.update({
    where: { id: link.volunteerId },
    data: { reportsToId: link.managerId },
  });
  await mirrorMembership(tx, scope, link.volunteerId);
}
