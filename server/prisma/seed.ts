import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { CommitteeRole, ShiftBlock, StationKind } from '../src/generated/prisma/enums.js';

/**
 * Idempotent seed (BUILD_PLAN §5.10).
 *
 * Every write is an upsert, never a create, so this can be re-run against a
 * database that already has data — including production, where it establishes
 * the event days, the station list and the Admin account and touches nothing
 * else.
 *
 * The fake volunteers and shift assignments are created only outside
 * production. A seeded account with a predictable identity is a back door, and
 * this is the guard that keeps one out of the real system.
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

/** Midnight UTC, the anchor Prisma uses for a `@db.Date` column. */
function day(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * The event window (PRODUCT_BRIEF header): Sec 4 tours 6–8 Jan, SP Open House
 * 7–9 Jan, Discovery Evening on 8 Jan.
 */
const EVENT_DAYS = [
  { date: '2027-01-06', label: 'Sec 4 Tour Day 1', isPublicDay: false, isTourDay: true },
  {
    date: '2027-01-07',
    label: 'Sec 4 Tour Day 2 / Open House Day 1',
    isPublicDay: true,
    isTourDay: true,
  },
  {
    date: '2027-01-08',
    label: 'Sec 4 Tour Day 3 / Open House Day 2 / Discovery Evening',
    isPublicDay: true,
    isTourDay: true,
  },
  { date: '2027-01-09', label: 'Open House Day 3', isPublicDay: true, isTourDay: false },
] as const;

/**
 * Station list. `countsEntry` marks the five rooms whose entries are counted
 * (PRODUCT_BRIEF §3); `issuesStamp` marks where a Mission Card is stamped.
 *
 * OPEN QUESTION for the Chief Coordinator (BUILD_PLAN §15.6): confirm the exact
 * station list and which rooms require entry counting. The set below follows
 * slide 28 and is the working assumption until that is confirmed.
 */
const STATIONS = [
  {
    code: 'SIGNUP_BOOTH',
    name: 'Sign-Up Booth',
    kind: 'SIGNUP_BOOTH',
    floor: 'L1',
    countsEntry: false,
    issuesStamp: false,
    sortOrder: 10,
  },
  {
    code: 'WELCOME_LOUNGE',
    name: 'Welcome Lounge',
    kind: 'WELCOME_LOUNGE',
    floor: 'L1',
    countsEntry: true,
    issuesStamp: true,
    sortOrder: 20,
  },
  {
    code: 'DAAA_STATION',
    name: 'DAAA Station',
    kind: 'COURSE_STATION',
    courseCode: 'DAAA',
    floor: 'L2',
    countsEntry: true,
    issuesStamp: true,
    sortOrder: 30,
  },
  {
    code: 'DCDF_STATION',
    name: 'DCDF Station',
    kind: 'COURSE_STATION',
    courseCode: 'DCDF',
    floor: 'L2',
    countsEntry: true,
    issuesStamp: true,
    sortOrder: 40,
  },
  {
    code: 'DCS_STATION',
    name: 'DCS Station',
    kind: 'COURSE_STATION',
    courseCode: 'DCS',
    floor: 'L3',
    countsEntry: true,
    issuesStamp: true,
    sortOrder: 50,
  },
  {
    code: 'MISSION_COMPLETE',
    name: 'Mission Complete Area',
    kind: 'MISSION_COMPLETE',
    floor: 'L1',
    countsEntry: true,
    issuesStamp: true,
    sortOrder: 60,
  },
  {
    code: 'WELCOME_PARTY',
    name: 'Welcome Party',
    kind: 'WELCOME_PARTY',
    floor: 'L1',
    countsEntry: false,
    issuesStamp: false,
    sortOrder: 70,
  },
  {
    code: 'T19_FOYER',
    name: 'T19 Foyer',
    kind: 'OTHER',
    floor: 'L1',
    countsEntry: false,
    issuesStamp: false,
    sortOrder: 80,
  },
] as const;

const GIFT_TYPES = [
  { name: 'SoC Tote Bag', initialStock: 800, lowStockThreshold: 100 },
  { name: 'SoC Water Bottle', initialStock: 500, lowStockThreshold: 75 },
  { name: 'Mission Complete Badge', initialStock: 1200, lowStockThreshold: 150 },
] as const;

/**
 * Development fixtures: one volunteer per role, so the capability matrix can be
 * exercised by hand through `POST /api/v1/dev-auth/sign-in`.
 */
const DEV_VOLUNTEERS = [
  { email: 'admin@spoh2027.test', displayName: 'Ada Admin', role: 'ADMIN', portfolio: null },
  {
    email: 'lead@spoh2027.test',
    displayName: 'Lee Lead',
    role: 'LEAD',
    portfolio: 'Comms & Outreach',
  },
  {
    email: 'chief@spoh2027.test',
    displayName: 'Chen Chief',
    role: 'CHIEF_COORDINATOR',
    portfolio: null,
  },
  {
    email: 'dc@spoh2027.test',
    displayName: 'Dana Deputy',
    role: 'DEPUTY_COORDINATOR',
    portfolio: 'Operations & Crowd Management',
  },
  { email: 'ic@spoh2027.test', displayName: 'Ivan IC', role: 'IC', portfolio: null },
  { email: 'booth@spoh2027.test', displayName: 'Bea Booth', role: 'VOLUNTEER', portfolio: null },
  {
    email: 'counter@spoh2027.test',
    displayName: 'Cal Counter',
    role: 'VOLUNTEER',
    portfolio: null,
  },
] as const;

/** Which station each dev volunteer works, so station scoping is testable. */
const DEV_ASSIGNMENTS: Array<{ email: string; stationCode: string; roleLabel: string }> = [
  { email: 'booth@spoh2027.test', stationCode: 'SIGNUP_BOOTH', roleLabel: 'Registration' },
  { email: 'counter@spoh2027.test', stationCode: 'DCDF_STATION', roleLabel: 'Counter' },
  { email: 'ic@spoh2027.test', stationCode: 'SIGNUP_BOOTH', roleLabel: 'Booth IC' },
];

/**
 * The two dry runs (BUILD_PLAN §12). They are real operating days with real
 * rosters, so they need `EventDay` rows — they just run against staging so the
 * data never mixes with the event itself.
 */
const DRY_RUN_DAYS = [
  { date: '2026-11-18', label: 'Dry Run #1', isPublicDay: false, isTourDay: false },
  { date: '2027-01-04', label: 'Dry Run #2', isPublicDay: false, isTourDay: false },
] as const;

/**
 * Today, as a sandbox event day. Development only.
 *
 * Station scoping requires an assignment on today's event day in a running
 * shift block, so without this nothing captures on a developer machine in
 * September and every capture screen looks broken for the wrong reason.
 */
function sandboxDay(): { date: string; label: string; isPublicDay: boolean; isTourDay: boolean } {
  // Singapore is UTC+8 year round, so shifting by 8h gives the local date.
  const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { date: today, label: 'Local Dev Sandbox', isPublicDay: false, isTourDay: false };
}

async function seedEventDays(): Promise<void> {
  const days = [...EVENT_DAYS, ...DRY_RUN_DAYS, ...(isProduction ? [] : [sandboxDay()])];

  for (const eventDay of days) {
    await prisma.eventDay.upsert({
      where: { date: day(eventDay.date) },
      create: {
        date: day(eventDay.date),
        label: eventDay.label,
        isPublicDay: eventDay.isPublicDay,
        isTourDay: eventDay.isTourDay,
      },
      update: {
        label: eventDay.label,
        isPublicDay: eventDay.isPublicDay,
        isTourDay: eventDay.isTourDay,
      },
    });
  }
}

async function seedStations(): Promise<void> {
  for (const station of STATIONS) {
    const data = {
      name: station.name,
      kind: station.kind as StationKind,
      courseCode: 'courseCode' in station ? station.courseCode : null,
      floor: station.floor,
      countsEntry: station.countsEntry,
      issuesStamp: station.issuesStamp,
      sortOrder: station.sortOrder,
      active: true,
    };

    await prisma.station.upsert({
      where: { code: station.code },
      create: { code: station.code, ...data },
      update: data,
    });
  }
}

async function seedGiftTypes(): Promise<void> {
  for (const gift of GIFT_TYPES) {
    await prisma.giftType.upsert({
      where: { name: gift.name },
      create: { ...gift },
      // Stock levels are operational data. Re-running the seed must not reset a
      // threshold the gift team has already tuned during the event.
      update: {},
    });
  }
}

async function seedAdmin(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@spoh2027.test';
  const displayName = process.env.SEED_ADMIN_NAME ?? 'SPOH 2027 Administrator';

  await prisma.volunteer.upsert({
    where: { email },
    create: {
      email,
      displayName,
      cognitoSub: process.env.SEED_ADMIN_SUB ?? localSub(email),
      role: 'ADMIN' as CommitteeRole,
    },
    update: { role: 'ADMIN' as CommitteeRole, active: true },
  });
}

async function seedDevelopmentFixtures(): Promise<void> {
  for (const volunteer of DEV_VOLUNTEERS) {
    await prisma.volunteer.upsert({
      where: { email: volunteer.email },
      create: {
        email: volunteer.email,
        displayName: volunteer.displayName,
        cognitoSub: localSub(volunteer.email),
        role: volunteer.role as CommitteeRole,
        portfolio: volunteer.portfolio,
        phone: '+65 8000 0000',
      },
      update: { role: volunteer.role as CommitteeRole, active: true },
    });
  }

  // Reporting lines, so `GET /me` returns a usable escalation chain.
  const byEmail = new Map(
    (
      await prisma.volunteer.findMany({
        where: { email: { in: DEV_VOLUNTEERS.map((v) => v.email) } },
        select: { id: true, email: true },
      })
    ).map((v) => [v.email, v.id]),
  );

  const chain: Array<[string, string]> = [
    ['booth@spoh2027.test', 'ic@spoh2027.test'],
    ['counter@spoh2027.test', 'ic@spoh2027.test'],
    ['ic@spoh2027.test', 'dc@spoh2027.test'],
    ['dc@spoh2027.test', 'chief@spoh2027.test'],
  ];

  for (const [subordinate, manager] of chain) {
    const subordinateId = byEmail.get(subordinate);
    const managerId = byEmail.get(manager);
    if (subordinateId && managerId) {
      await prisma.volunteer.update({
        where: { id: subordinateId },
        data: { reportsToId: managerId },
      });
    }
  }

  // Assign every dev volunteer to both blocks on every event day, so station
  // scoping can be exercised whatever day the developer happens to run this.
  const eventDays = await prisma.eventDay.findMany({ select: { id: true } });
  const stations = new Map(
    (await prisma.station.findMany({ select: { id: true, code: true } })).map((s) => [
      s.code,
      s.id,
    ]),
  );

  for (const assignment of DEV_ASSIGNMENTS) {
    const volunteerId = byEmail.get(assignment.email);
    const stationId = stations.get(assignment.stationCode);
    if (!volunteerId || !stationId) continue;

    for (const eventDay of eventDays) {
      for (const block of ['MORNING', 'AFTERNOON'] as ShiftBlock[]) {
        await prisma.shiftAssignment.upsert({
          where: {
            volunteerId_eventDayId_block: { volunteerId, eventDayId: eventDay.id, block },
          },
          create: {
            volunteerId,
            stationId,
            eventDayId: eventDay.id,
            block,
            roleLabel: assignment.roleLabel,
          },
          update: { stationId, roleLabel: assignment.roleLabel },
        });
      }
    }
  }
}

/**
 * Briefing waves (PRODUCT_BRIEF §6.2).
 *
 * Waves of 20 Sec 4 students every 30 minutes across the tour days, one briefer
 * per wave rotating through the Chief and the Deputy Coordinators. Seeded
 * unassigned in production — who briefs which wave is the Chief's call, not a
 * seed script's.
 */
async function seedBriefingSlots(): Promise<void> {
  const tourDays = await prisma.eventDay.findMany({
    where: { isTourDay: true },
    select: { id: true, date: true },
  });

  // 09:30 to 12:30 Singapore time, every 30 minutes. Stored UTC (SGT is UTC+8).
  const startHourUtc = 1;
  const slotsPerDay = 7;

  for (const day of tourDays) {
    for (let index = 0; index < slotsPerDay; index += 1) {
      const startsAt = new Date(day.date);
      startsAt.setUTCHours(startHourUtc, 30 + index * 30, 0, 0);

      const existing = await prisma.briefingSlot.findFirst({
        where: { eventDayId: day.id, startsAt },
        select: { id: true },
      });

      if (!existing) {
        await prisma.briefingSlot.create({
          data: { eventDayId: day.id, startsAt, waveSize: 20 },
        });
      }
    }
  }
}

/**
 * A small batch of Mission Cards for development.
 *
 * Real cards are generated through `POST /api/v1/cards/batch` and printed; this
 * exists only so the stamp and redemption screens have something to scan on a
 * developer machine. Never in production, where a card that was never printed
 * would be a card nobody can present.
 */
async function seedDevMissionCards(): Promise<void> {
  const existing = await prisma.missionCard.count();
  if (existing > 0) return;

  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const rows = Array.from({ length: 50 }, (_unused, index) => {
    // Deterministic, so the same codes come back after a database reset and a
    // developer can keep a card code in a scratch file.
    let code = '';
    let n = index + 1;
    for (let i = 0; i < 6; i += 1) {
      code = alphabet[n % alphabet.length] + code;
      n = Math.floor(n / alphabet.length) + 7 * (i + 1);
    }
    return {
      shortCode: code,
      qrPayload: `spoh2027:dev-${String(index + 1).padStart(4, '0')}`,
      batchLabel: 'DEV',
    };
  });

  await prisma.missionCard.createMany({ data: rows, skipDuplicates: true });
  console.log(`seed: ${rows.length} development mission cards (batch DEV)`);
  console.log(`      try card ${rows[0]?.shortCode}`);
}

async function main(): Promise<void> {
  await seedEventDays();
  await seedStations();
  await seedGiftTypes();
  await seedAdmin();
  await seedBriefingSlots();

  if (isProduction) {
    console.log('seed: production — event days, stations, gift types and admin only');
  } else {
    await seedDevelopmentFixtures();
    await seedDevMissionCards();
    console.log('seed: development fixtures created');
    console.log(
      '      sign in with POST /api/v1/dev-auth/sign-in { "email": "booth@spoh2027.test" }',
    );
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
