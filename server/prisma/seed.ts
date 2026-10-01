import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { wallTimeToInstant, zonedDate } from '@spoh/shared';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { CommitteeRole } from '../src/generated/prisma/enums.js';
import {
  ASSIGNMENTS,
  CATEGORIES,
  COURSE_TAGS,
  DAYS,
  FIXTURE_EVENT,
  GIFT_TYPES,
  PEOPLE,
  REPORTING,
  SECOND_EVENT,
  SHIFT_TEMPLATES,
  STATIONS,
  type FixturePerson,
} from './fixtures/devEvent.js';

/**
 * The seed (P09.11): a development fixture generator, and in production the
 * administrator only.
 *
 * Production starts empty (D-12): its events come from the event factory
 * (P10 set-up), never from a script, so production gets the administrator
 * account and nothing else. Development and test databases get the fixture in
 * `fixtures/devEvent.ts`, generated relative to today on the event's clock,
 * so it is always live. Idempotent: every write finds or upserts, so a re-run
 * on another day adds that day's rows and changes nothing else.
 */

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  } catch {
    // Not a developer machine — DATABASE_URL is expected from the environment.
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to seed');

const isProduction = process.env.NODE_ENV === 'production';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

/** Matches the local identity provider, so seeded accounts work with dev tokens. */
function localSub(email: string): string {
  return `local:${createHash('sha256').update(email).digest('hex').slice(0, 32)}`;
}

/** "YYYY-MM-DD" `days` after `date`. */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Midnight UTC, the anchor Prisma uses for a `@db.Date` column. */
function anchor(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

type Scope = { eventId: string };

// ── People ──────────────────────────────────────────────────────────────────

async function upsertPerson(person: FixturePerson & { sub?: string }): Promise<string> {
  const row = await prisma.person.upsert({
    where: { email: person.email },
    create: {
      email: person.email,
      displayName: person.displayName,
      cognitoSub: person.sub ?? localSub(person.email),
      role: person.role,
      portfolio: person.portfolio,
      phone: '+65 8000 0000',
    },
    update: { role: person.role, active: true },
  });
  return row.id;
}

async function upsertMembership(
  scope: Scope,
  personId: string,
  as: { role: CommitteeRole; portfolio?: string | null },
) {
  const fields = { role: as.role, portfolio: as.portfolio ?? null };
  return prisma.eventMembership.upsert({
    where: { eventId_personId: { eventId: scope.eventId, personId } },
    create: { eventId: scope.eventId, personId, ...fields },
    update: { ...fields, status: 'ACTIVE' },
  });
}

/**
 * The administrator: from the environment in a deployment, the fixture's own
 * otherwise. The only thing production gets.
 */
async function seedAdmin(): Promise<string> {
  const email = (
    process.env.ATTENDANCE_ROOT_EMAIL ??
    process.env.SEED_ADMIN_EMAIL ??
    'admin@spoh2027.test'
  ).toLowerCase();
  return upsertPerson({
    email,
    displayName: process.env.SEED_ADMIN_NAME ?? 'Administrator',
    role: 'ADMIN',
    portfolio: null,
    ...(process.env.SEED_ADMIN_SUB ? { sub: process.env.SEED_ADMIN_SUB } : {}),
  });
}

// ── The event and its structure ────────────────────────────────────────────

async function seedEvent(): Promise<Scope & { today: string }> {
  const organisation = await prisma.organisation.findFirstOrThrow({
    orderBy: { createdAt: 'asc' },
  });
  await prisma.event.upsert({
    where: { id: FIXTURE_EVENT.id },
    create: { ...FIXTURE_EVENT, organisationId: organisation.id, status: 'LIVE' },
    update: {},
  });
  const scope = { eventId: FIXTURE_EVENT.id };
  for (const [index, category] of CATEGORIES.entries()) {
    await prisma.captureCategory.upsert({
      where: { eventId_code: { eventId: scope.eventId, code: category.code } },
      create: { ...scope, ...category, sortOrder: index + 1 },
      update: {},
    });
  }
  return { ...scope, today: zonedDate(new Date(), FIXTURE_EVENT.timezone) };
}

/** One station type per (kind, counts, stamps) combination, as the P09.4 migration made them. */
async function typeIdFor(scope: Scope, station: (typeof STATIONS)[number]): Promise<string> {
  const code = `${station.kind}${station.countsEntry ? '_COUNTED' : ''}${station.issuesStamp ? '_STAMPED' : ''}`;
  const type = await prisma.stationType.upsert({
    where: { eventId_code: { eventId: scope.eventId, code } },
    create: {
      ...scope,
      code,
      label: station.kind.charAt(0) + station.kind.slice(1).toLowerCase().replaceAll('_', ' '),
      registersVisitors: station.kind === 'SIGNUP_BOOTH',
      redeemsGifts: station.kind === 'MISSION_COMPLETE',
      countsEntry: station.countsEntry,
      issuesStamp: station.issuesStamp,
    },
    update: {},
  });
  return type.id;
}

async function seedStations(scope: Scope): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const station of STATIONS) {
    const typeId = await typeIdFor(scope, station);
    const row = await prisma.station.upsert({
      where: { eventId_code: { eventId: scope.eventId, code: station.code } },
      create: {
        ...scope,
        code: station.code,
        name: station.name,
        floor: station.floor,
        sortOrder: station.sortOrder,
        typeId,
      },
      update: { name: station.name, typeId, active: true },
    });
    ids.set(station.code, row.id);
    if (station.courseCode) await tagStation(scope, row.id, station.courseCode);
  }
  return ids;
}

async function tagStation(scope: Scope, stationId: string, course: string): Promise<void> {
  const label = COURSE_TAGS.find((tag) => tag.code === course)?.label ?? course;
  const tag = await prisma.stationTag.upsert({
    where: { eventId_code: { eventId: scope.eventId, code: course } },
    create: { ...scope, code: course, label },
    update: {},
  });
  await prisma.stationTagging.upsert({
    where: { stationId_tagId: { stationId, tagId: tag.id } },
    create: { ...scope, stationId, tagId: tag.id },
    update: {},
  });
}

async function seedGiftTypes(scope: Scope): Promise<void> {
  for (const gift of GIFT_TYPES) {
    // Stock is operational: a re-run never resets a threshold tuned during the event.
    await prisma.giftType.upsert({
      where: { eventId_name: { eventId: scope.eventId, name: gift.name } },
      create: { ...scope, ...gift },
      update: {},
    });
  }
}

// ── Days and shifts ────────────────────────────────────────────────────────

/** A seeded day: its shifts by template code. */
type Day = { id: string; date: string; isTourDay: boolean; shifts: Map<string, string> };

async function seedTemplates(scope: Scope, timezone: string) {
  const templates = [];
  for (const [index, template] of SHIFT_TEMPLATES.entries()) {
    templates.push(
      await prisma.shiftTemplate.upsert({
        where: { eventId_code: { eventId: scope.eventId, code: template.code } },
        create: { ...scope, ...template, sortOrder: index + 1 },
        update: {},
      }),
    );
  }
  return { templates, timezone };
}

async function seedDay(
  scope: Scope,
  day: { date: string; label: string; isPublicDay: boolean; isTourDay: boolean },
  plan: Awaited<ReturnType<typeof seedTemplates>>,
): Promise<Day> {
  const { date, ...fields } = day;
  const row = await prisma.eventDay.upsert({
    where: { eventId_date: { eventId: scope.eventId, date: anchor(date) } },
    create: { ...scope, date: anchor(date), ...fields },
    update: fields,
  });
  const shifts = new Map<string, string>();
  for (const template of plan.templates) {
    const shift = await prisma.shift.upsert({
      where: { eventDayId_templateId: { eventDayId: row.id, templateId: template.id } },
      create: {
        ...scope,
        eventDayId: row.id,
        templateId: template.id,
        startsAt: wallTimeToInstant(date, template.startLocal, plan.timezone),
        endsAt: wallTimeToInstant(date, template.endLocal, plan.timezone),
      },
      update: {},
    });
    shifts.set(template.code, shift.id);
  }
  return { id: row.id, date, isTourDay: day.isTourDay, shifts };
}

async function seedDays(scope: Scope, today: string): Promise<Day[]> {
  const plan = await seedTemplates(scope, FIXTURE_EVENT.timezone);
  const days: Day[] = [];
  for (const { offset, ...day } of DAYS) {
    days.push(await seedDay(scope, { ...day, date: addDays(today, offset) }, plan));
  }
  return days;
}

// ── The roster ─────────────────────────────────────────────────────────────

async function seedPeople(
  scope: Scope,
): Promise<Map<string, { personId: string; membershipId: string }>> {
  const people = new Map<string, { personId: string; membershipId: string }>();
  for (const person of PEOPLE) {
    const personId = await upsertPerson(person);
    const membership = await upsertMembership(scope, personId, person);
    people.set(person.email, { personId, membershipId: membership.id });
  }
  for (const [subordinate, manager] of REPORTING) {
    const [from, to] = [people.get(subordinate), people.get(manager)];
    if (!from || !to) continue;
    await prisma.person.update({
      where: { id: from.personId },
      data: { reportsToId: to.personId },
    });
    await prisma.eventMembership.update({
      where: { eventId_id: { eventId: scope.eventId, id: from.membershipId } },
      data: { reportsToId: to.membershipId },
    });
  }
  return people;
}

async function assign(
  scope: Scope,
  who: { personId: string; membershipId: string; stationId: string; roleLabel: string },
  shift: { day: Day; code: string },
): Promise<void> {
  const { day, code } = shift;
  const shiftId = day.shifts.get(code);
  if (!shiftId) throw new Error(`no ${code} shift on ${day.date}`);
  await prisma.shiftAssignment.upsert({
    where: { volunteerId_shiftId: { volunteerId: who.personId, shiftId } },
    create: {
      ...scope,
      volunteerId: who.personId,
      membershipId: who.membershipId,
      stationId: who.stationId,
      eventDayId: day.id,
      shiftId,
      roleLabel: who.roleLabel,
    },
    update: { stationId: who.stationId, roleLabel: who.roleLabel },
  });
}

async function seedAssignments(
  scope: Scope,
  input: {
    days: Day[];
    stations: Map<string, string>;
    people: Awaited<ReturnType<typeof seedPeople>>;
  },
): Promise<void> {
  for (const assignment of ASSIGNMENTS) {
    const person = input.people.get(assignment.email);
    const stationId = input.stations.get(assignment.stationCode);
    if (!person || !stationId) continue;
    for (const day of input.days) {
      for (const code of day.shifts.keys()) {
        await assign(
          scope,
          { ...person, stationId, roleLabel: assignment.roleLabel },
          { day, code },
        );
      }
    }
  }
}

/** Briefing waves every 30 minutes, 09:30–12:30 on the event's clock, on tour days. */
async function seedBriefingSlots(scope: Scope, days: Day[]): Promise<void> {
  for (const day of days.filter((candidate) => candidate.isTourDay)) {
    for (let index = 0; index < 7; index += 1) {
      const minutes = 9 * 60 + 30 + index * 30;
      const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      const startsAt = wallTimeToInstant(day.date, time, FIXTURE_EVENT.timezone);
      const existing = await prisma.briefingSlot.findFirst({
        where: { ...scope, eventDayId: day.id, startsAt },
      });
      if (!existing) {
        await prisma.briefingSlot.create({
          data: { ...scope, eventDayId: day.id, startsAt, waveSize: 20 },
        });
      }
    }
  }
}

/** Fifty cards to scan on a developer machine, with codes that stay the same run to run. */
async function seedMissionCards(scope: Scope): Promise<void> {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const rows = Array.from({ length: 50 }, (_unused, index) => {
    let code = '';
    let n = index + 1;
    for (let i = 0; i < 6; i += 1) {
      code = alphabet[n % alphabet.length] + code;
      n = Math.floor(n / alphabet.length) + 7 * (i + 1);
    }
    return {
      ...scope,
      shortCode: code,
      qrPayload: `spoh2027:dev-${String(index + 1).padStart(4, '0')}`,
      batchLabel: 'DEV',
    };
  });
  await prisma.missionCard.createMany({ data: rows, skipDuplicates: true });
  console.log(`seed: try card ${rows[0]?.shortCode}`);
}

// ── The second event ───────────────────────────────────────────────────────

async function seedSecondEvent(first: Scope, today: string): Promise<void> {
  const organisation = await prisma.organisation.findFirstOrThrow({
    orderBy: { createdAt: 'asc' },
  });
  const { station, person, ...event } = SECOND_EVENT;
  await prisma.event.upsert({
    where: { id: event.id },
    create: {
      id: event.id,
      organisationId: organisation.id,
      slug: event.slug,
      name: event.name,
      timezone: FIXTURE_EVENT.timezone,
      status: 'LIVE',
    },
    update: {},
  });
  const scope = { eventId: event.id };
  const type = await prisma.stationType.upsert({
    where: { eventId_code: { eventId: event.id, code: 'SIGNUP_BOOTH' } },
    create: { ...scope, code: 'SIGNUP_BOOTH', label: 'Sign-up booth', registersVisitors: true },
    update: {},
  });
  for (const [index, code] of (['SEC_4', 'OTHER'] as const).entries()) {
    await prisma.captureCategory.upsert({
      where: { eventId_code: { eventId: event.id, code } },
      create: { ...scope, code, label: code === 'OTHER' ? 'Other' : 'Sec 4', sortOrder: index + 1 },
      update: {},
    });
  }
  const booth = await prisma.station.upsert({
    where: { eventId_code: { eventId: event.id, code: station.code } },
    create: {
      ...scope,
      typeId: type.id,
      code: station.code,
      name: station.name,
    },
    update: {},
  });
  const plan = await seedTemplates(scope, FIXTURE_EVENT.timezone);
  const day = await seedDay(
    scope,
    {
      date: addDays(today, event.dayOffset),
      label: event.dayLabel,
      isPublicDay: true,
      isTourDay: false,
    },
    plan,
  );
  const personId = await upsertPerson({ ...person, role: 'VOLUNTEER', portfolio: null });
  const membership = await upsertMembership(scope, personId, { role: 'IC' });
  await assign(
    scope,
    { personId, membershipId: membership.id, stationId: booth.id, roleLabel: 'Booth IC' },
    { day, code: 'MORNING' },
  );
  await seedMultiInFirstEvent(first, personId);
}

/** The same person as a volunteer of the first event, at its booth, mornings. */
async function seedMultiInFirstEvent(first: Scope, personId: string): Promise<void> {
  const membership = await upsertMembership(first, personId, { role: 'VOLUNTEER' });
  const booth = await prisma.station.findUniqueOrThrow({
    where: { eventId_code: { eventId: first.eventId, code: 'SIGNUP_BOOTH' } },
  });
  const shifts = await prisma.shift.findMany({
    where: { eventId: first.eventId, template: { code: 'MORNING' } },
    select: { id: true, eventDayId: true },
  });
  for (const shift of shifts) {
    const day: Day = {
      id: shift.eventDayId,
      date: '',
      isTourDay: false,
      shifts: new Map([['MORNING', shift.id]]),
    };
    await assign(
      first,
      { personId, membershipId: membership.id, stationId: booth.id, roleLabel: 'Registration' },
      { day, code: 'MORNING' },
    );
  }
}

// ── Run ────────────────────────────────────────────────────────────────────

async function seedFixture(): Promise<void> {
  const { today, ...event } = await seedEvent();
  const stations = await seedStations(event);
  await seedGiftTypes(event);
  const days = await seedDays(event, today);
  const people = await seedPeople(event);
  await seedAssignments(event, { days, stations, people });
  await seedBriefingSlots(event, days);
  await seedMissionCards(event);
  await upsertMembership(event, await seedAdmin(), { role: 'ADMIN' });
  await seedSecondEvent(event, today);
  console.log(`seed: ${FIXTURE_EVENT.name} and ${SECOND_EVENT.name}, days from ${today}`);
  console.log(
    '      sign in with POST /api/v1/dev-auth/sign-in { "email": "booth@spoh2027.test" }',
  );
}

async function main(): Promise<void> {
  if (isProduction) {
    await seedAdmin();
    console.log('seed: production — the administrator only; events come from set-up (D-12)');
  } else {
    await seedFixture();
  }
  console.log('seed: done');
}

main()
  .catch((error: unknown) => {
    console.error('seed failed', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
