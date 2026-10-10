import type { CommitteeRole } from '@spoh/shared';
import type { Person } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { membershipIdOf } from '../../../platform/db/membershipMirror.js';
import { assignmentLinks } from '../../assignments/index.js';

/**
 * Data access for the committee roster.
 *
 * This is the one schema holding names, emails and phone numbers. That is
 * ordinary — it is our own team, not visitors — but it lives apart from every
 * capture model and is archived once the post-event report is signed off
 * (PRODUCT_BRIEF §0.2).
 */

/**
 * A person as this event's roster sees them: the identity, with the role,
 * portfolio, manager and standing of their membership (ADR-001 §1). Someone
 * not yet in the event is a volunteer in good standing, about to be added.
 */
export type Volunteer = Person & {
  role: CommitteeRole;
  portfolio: string | null;
  reportsToId: string | null;
  active: boolean;
  membershipStatus: string | null;
};

function withMembership(scope: EventScope) {
  return {
    eventMemberships: {
      where: { eventId: scope.eventId },
      select: {
        role: true,
        portfolio: true,
        status: true,
        reportsTo: { select: { personId: true } },
      },
    },
  } as const;
}

type PersonWithMembership = Person & {
  eventMemberships: Array<{
    role: CommitteeRole;
    portfolio: string | null;
    status: string;
    reportsTo: { personId: string } | null;
  }>;
};

function asVolunteer(row: PersonWithMembership): Volunteer {
  const { eventMemberships, ...person } = row;
  const [membership] = eventMemberships;
  if (!membership)
    return {
      ...person,
      role: 'VOLUNTEER',
      portfolio: null,
      reportsToId: null,
      active: true,
      membershipStatus: null,
    };
  return {
    ...person,
    role: membership.role,
    portfolio: membership.portfolio,
    reportsToId: membership.reportsTo?.personId ?? null,
    active: membership.status === 'ACTIVE',
    membershipStatus: membership.status,
  };
}

export async function findVolunteerByEmail(
  scope: EventScope,
  email: string,
  tx: PrismaTransactionClient = prisma,
): Promise<Volunteer | null> {
  const row = await tx.person.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: withMembership(scope),
  });
  return row ? asVolunteer(row) : null;
}

/** The person's membership of the event, created when missing; role and line set. */
async function upsertMembership(
  tx: PrismaTransactionClient,
  scope: EventScope,
  member: {
    personId: string;
    role: CommitteeRole;
    portfolio?: string | null;
    reportsToId?: string | null;
  },
): Promise<void> {
  const { eventId } = scope;
  const reportsToId = member.reportsToId
    ? await membershipIdOf(tx, scope, member.reportsToId)
    : undefined;
  // Unchanged unless the row names them, as before: a re-run of an import
  // without a portfolio column keeps the portfolios already there.
  const named = {
    role: member.role,
    ...(member.portfolio ? { portfolio: member.portfolio } : {}),
    ...(reportsToId ? { reportsToId } : {}),
  };
  await tx.eventMembership.upsert({
    where: { eventId_personId: { eventId, personId: member.personId } },
    create: {
      eventId,
      personId: member.personId,
      status: 'INVITED',
      invitedAt: new Date(),
      ...named,
    },
    update: named,
  });
}

export async function upsertVolunteer(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: {
    cognitoSub: string;
    displayName: string;
    email: string;
    phone?: string | null;
    role: CommitteeRole;
    portfolio?: string | null;
    reportsToId?: string | null;
  },
): Promise<{ volunteer: Volunteer; created: boolean }> {
  const existing = await tx.person.findFirst({
    where: { email: { equals: data.email, mode: 'insensitive' } },
  });
  const person = existing
    ? await tx.person.update({
        where: { id: existing.id },
        data: { displayName: data.displayName, phone: data.phone ?? existing.phone },
      })
    : await tx.person.create({
        data: {
          cognitoSub: data.cognitoSub,
          displayName: data.displayName,
          email: data.email,
          phone: data.phone ?? null,
        },
      });
  await upsertMembership(tx, scope, { personId: person.id, ...data });
  const volunteer = (await findVolunteerByEmail(scope, data.email, tx)) as Volunteer;
  return { volunteer, created: !existing };
}

/**
 * Upsert an assignment. The unique key is (volunteer, shift) — one person
 * cannot be in two places on the same shift, which is exactly the constraint
 * that makes a re-run of the roster import safe.
 */
export async function upsertAssignment(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: {
    volunteerId: string;
    stationId: string;
    eventDayId: string;
    shiftId: string;
    roleLabel: string;
  },
): Promise<{ created: boolean }> {
  const existing = await tx.shiftAssignment.findUnique({
    where: {
      volunteerId_shiftId: { volunteerId: data.volunteerId, shiftId: data.shiftId },
      eventId: scope.eventId,
    },
    select: { id: true },
  });
  const links = await assignmentLinks(tx, scope, data.volunteerId);

  if (existing) {
    await tx.shiftAssignment.update({
      where: { id: existing.id, eventId: scope.eventId },
      data: { stationId: data.stationId, roleLabel: data.roleLabel, ...links },
    });
    return { created: false };
  }

  await tx.shiftAssignment.create({ data: { ...data, ...links } });
  return { created: true };
}

/** The accounts with these emails, by email, as this event's roster sees them. */
export async function findVolunteersByEmails(
  scope: EventScope,
  emails: readonly string[],
): Promise<Map<string, Volunteer>> {
  if (emails.length === 0) return new Map();
  const rows = await prisma.person.findMany({
    where: { email: { in: [...emails] } },
    include: withMembership(scope),
  });
  return new Map(rows.map((row) => [row.email, asVolunteer(row)]));
}

/** Every event day, keyed by its date (YYYY-MM-DD), for matching import rows. */
export async function eventDayIdsByDate(scope: EventScope): Promise<Map<string, string>> {
  const days = await prisma.eventDay.findMany({
    where: { eventId: scope.eventId },
    select: { id: true, date: true },
  });
  return new Map(days.map((day) => [day.date.toISOString().slice(0, 10), day.id]));
}

/** Every station, keyed by its code, for matching import rows. */
export async function stationIdsByCode(scope: EventScope): Promise<Map<string, string>> {
  const stations = await prisma.station.findMany({
    where: { eventId: scope.eventId },
    select: { id: true, code: true },
  });
  return new Map(stations.map((station) => [station.code, station.id]));
}

/** The event's shifts, as eventDayId|templateCode → shiftId, for matching import rows. */
export async function shiftIdsByDayAndCode(scope: EventScope): Promise<Map<string, string>> {
  const shifts = await prisma.shift.findMany({
    where: { eventId: scope.eventId },
    select: { id: true, eventDayId: true, template: { select: { code: true } } },
  });
  return new Map(shifts.map((shift) => [`${shift.eventDayId}|${shift.template.code}`, shift.id]));
}

/** The shifts these volunteers already hold, as volunteerId|shiftId. */
export async function existingSlots(
  scope: EventScope,
  volunteerIds: readonly string[],
): Promise<Set<string>> {
  if (volunteerIds.length === 0) return new Set();
  const rows = await prisma.shiftAssignment.findMany({
    where: { eventId: scope.eventId, volunteerId: { in: [...volunteerIds] } },
    select: { volunteerId: true, shiftId: true },
  });
  return new Set(rows.map((row) => `${row.volunteerId}|${row.shiftId}`));
}

export async function setManager(
  tx: PrismaTransactionClient,
  scope: EventScope,
  link: { volunteerId: string; managerId: string },
): Promise<void> {
  await tx.eventMembership.update({
    where: { eventId_personId: { eventId: scope.eventId, personId: link.volunteerId } },
    data: { reportsToId: await membershipIdOf(tx, scope, link.managerId) },
  });
}
