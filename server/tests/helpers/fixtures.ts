import { createHash, randomUUID } from 'node:crypto';
import type { CommitteeRole, ShiftBlock } from '@spoh/shared';
import { env } from '../../src/config/env.js';
import { prisma } from '../../src/platform/db/client.js';
import type { EventScope } from '../../src/platform/db/eventScope.js';
import { mirrorMembership } from '../../src/platform/db/membershipMirror.js';
import { createEvent } from '../../src/modules/event/index.js';
import { addShiftsForDay } from '../../src/modules/eventDays/index.js';
import { typeIdFor } from '../../src/modules/station/data/repo.js';
import { assignmentLinks } from '../../src/modules/assignments/index.js';
import { createLocalAuthProvider } from '../../src/platform/identity/localProvider.js';
import { invalidateVolunteerCache } from '../../src/platform/identity/index.js';
import { zonedDate } from '@spoh/shared';
import { eventDayAnchor } from '../../src/platform/time/index.js';

/**
 * Fixtures for the integration suite.
 *
 * Everything is created against "today" in the test event's timezone, which
 * the frozen clock in tests/setup.ts pins to a real event day inside the
 * MORNING shift. Station scoping asks "is this volunteer rostered here, on a
 * shift running now", so fixtures and the code under test must agree on what
 * now is.
 */

const issuer = createLocalAuthProvider({
  secret: env.LOCAL_AUTH_SECRET ?? 'test-secret-at-least-thirty-two-characters',
  nodeEnv: 'test',
});

export interface TestVolunteer {
  id: string;
  email: string;
  sub: string;
  role: CommitteeRole;
  token: string;
}

const TEST_EVENT_SLUG = 'test-event';
/** The test event's timezone: a fixture, where a zone name belongs. */
export const TEST_EVENT_TIMEZONE = 'Asia/Singapore';

/**
 * The event every fixture belongs to, created on first use through the same
 * factory production uses (P09.5), with today's taxonomy.
 */
export async function testEvent(): Promise<EventScope> {
  const existing = await prisma.event.findFirst({
    where: { slug: TEST_EVENT_SLUG },
    select: { id: true },
  });
  if (existing) return { eventId: existing.id };

  const organisation = await prisma.organisation.upsert({
    where: { slug: 'test-organisation' },
    create: {
      slug: 'test-organisation',
      name: 'Test Organisation',
      appName: 'Test Ops',
      defaultTimezone: TEST_EVENT_TIMEZONE,
    },
    update: {},
    select: { id: true },
  });
  const event = await createEvent({
    organisationId: organisation.id,
    slug: TEST_EVENT_SLUG,
    name: 'Test Event',
    timezone: TEST_EVENT_TIMEZONE,
    status: 'LIVE',
    categories: [
      { code: 'SEC_1', label: 'Sec 1' },
      { code: 'SEC_2', label: 'Sec 2' },
      { code: 'SEC_3', label: 'Sec 3' },
      { code: 'SEC_4', label: 'Sec 4' },
      { code: 'SEC_5', label: 'Sec 5' },
      { code: 'GRADUATED_AWAITING_RESULTS', label: 'Graduated, awaiting results' },
      { code: 'PARENT_GUARDIAN', label: 'Parent / Guardian' },
      { code: 'OTHER', label: 'Other' },
    ],
    stationTypes: [
      { code: 'SIGNUP_BOOTH', label: 'Sign-up booth', registersVisitors: true },
      { code: 'MISSION_COMPLETE', label: 'Mission complete', redeemsGifts: true },
      { code: 'OTHER', label: 'Other' },
    ],
    shiftTemplates: [
      { code: 'MORNING', label: 'Morning', startLocal: '09:30', endLocal: '14:00' },
      { code: 'AFTERNOON', label: 'Afternoon', startLocal: '13:30', endLocal: '18:00' },
    ],
  });
  return { eventId: event.id };
}

function subFor(email: string): string {
  return `local:${createHash('sha256').update(email).digest('hex').slice(0, 32)}`;
}

export async function createEventDayToday(): Promise<{ id: string }> {
  const scope = await testEvent();
  const today = zonedDate(new Date(), TEST_EVENT_TIMEZONE);
  const date = eventDayAnchor(today);
  const day = await prisma.eventDay.upsert({
    where: { eventId_date: { eventId: scope.eventId, date } },
    create: {
      eventId: scope.eventId,
      date,
      label: 'Test Day',
      isPublicDay: true,
      isTourDay: false,
    },
    update: {},
    select: { id: true },
  });
  await addShiftsForDay(prisma, scope, { id: day.id, date: today });
  return day;
}

export async function createStation(overrides: {
  code: string;
  name?: string;
  countsEntry?: boolean;
  issuesStamp?: boolean;
  active?: boolean;
}): Promise<{ id: string; code: string }> {
  const scope = await testEvent();
  const shape = {
    kind: 'OTHER' as const,
    countsEntry: overrides.countsEntry ?? false,
    issuesStamp: overrides.issuesStamp ?? false,
  };
  return prisma.station.upsert({
    where: { eventId_code: { eventId: scope.eventId, code: overrides.code } },
    create: {
      eventId: scope.eventId,
      typeId: await typeIdFor(prisma, scope, shape),
      code: overrides.code,
      name: overrides.name ?? overrides.code,
      ...shape,
      active: overrides.active ?? true,
    },
    update: {},
    select: { id: true, code: true },
  });
}

export async function createVolunteer(input: {
  email: string;
  role: CommitteeRole;
  displayName?: string;
}): Promise<TestVolunteer> {
  const sub = subFor(input.email);

  const volunteer = await prisma.person.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      displayName: input.displayName ?? input.email,
      cognitoSub: sub,
      role: input.role,
    },
    update: { role: input.role, active: true },
    select: { id: true },
  });
  await mirrorMembership(prisma, await testEvent(), volunteer.id);

  // The auth middleware caches sub -> volunteer for 60 seconds; a fixture
  // rebuilt between tests must not be served from a previous test's cache.
  invalidateVolunteerCache(sub);

  const token = await issuer.issue({ sub, groups: [input.role] });

  return { id: volunteer.id, email: input.email, sub, role: input.role, token };
}

export async function assignToStation(input: {
  volunteerId: string;
  stationId: string;
  eventDayId: string;
  block?: ShiftBlock;
  roleLabel?: string;
}): Promise<{ id: string }> {
  const block = input.block ?? 'MORNING';
  const links = await assignmentLinks(prisma, await testEvent(), { ...input, block });

  return prisma.shiftAssignment.upsert({
    where: {
      volunteerId_eventDayId_block: {
        volunteerId: input.volunteerId,
        eventDayId: input.eventDayId,
        block,
      },
      eventId: links.eventId,
    },
    create: {
      volunteerId: input.volunteerId,
      stationId: input.stationId,
      eventDayId: input.eventDayId,
      block,
      roleLabel: input.roleLabel ?? 'Volunteer',
      ...links,
    },
    update: { stationId: input.stationId, ...links },
    select: { id: true },
  });
}

/**
 * Assign to both blocks, so a test passes regardless of the wall-clock hour it
 * runs at. Shift scoping is time-sensitive by design and the suite should not
 * be.
 */
export async function assignToStationAllBlocks(input: {
  volunteerId: string;
  stationId: string;
  eventDayId: string;
  roleLabel?: string;
}): Promise<void> {
  for (const block of ['MORNING', 'AFTERNOON'] as ShiftBlock[]) {
    await assignToStation({ ...input, block });
  }
}

/** The test event's category for a code, for rows a test writes directly. */
export async function categoryId(code: string, scope?: EventScope): Promise<string> {
  const { eventId } = scope ?? (await testEvent());
  const category = await prisma.captureCategory.findUniqueOrThrow({
    where: { eventId_code: { eventId, code } },
    select: { id: true },
  });
  return category.id;
}

export function idempotencyKey(): string {
  return randomUUID();
}

export function bearer(volunteer: TestVolunteer): string {
  return `Bearer ${volunteer.token}`;
}

/** Take someone off the roster entirely: their memberships, then the person. */
export async function removeFromRoster(personId: string): Promise<void> {
  await prisma.eventMembership.deleteMany({
    where: { eventId: (await testEvent()).eventId, personId },
  });
  await prisma.person.delete({ where: { id: personId } });
  invalidateVolunteerCache();
}

/** Deactivate someone as the roster does: the person, mirrored onto the membership. */
export async function deactivate(where: { id: string } | { email: string }): Promise<void> {
  const person = await prisma.person.update({
    where,
    data: { active: false },
    select: { id: true },
  });
  await mirrorMembership(prisma, await testEvent(), person.id);
  invalidateVolunteerCache();
}
