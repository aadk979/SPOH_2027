import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../../src/config/env.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { prisma } from '../../src/platform/db/client.js';
import { invalidateEventCache } from '../../src/platform/event/events.js';
import { invalidateVolunteerCache } from '../../src/platform/identity/index.js';

/**
 * Test database helpers.
 *
 * The guard below is the important part: these functions delete every row in
 * the database, and running them against a real one would destroy an event's
 * worth of data. They refuse to run unless the connection string names a
 * database that looks like a test database.
 */
/**
 * The database without the event-scope guard, for tests to arrange and
 * inspect rows directly. The application only ever gets the guarded client
 * (`platform/db/client.ts`, ADR-001 §2); a test looking at a table is not a
 * request working in an event.
 */
export const rawDb = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

/**
 * The database NAME must end in `_test`. Deliberately stricter than "is it
 * localhost": a developer's own dev database is on localhost too, and wiping
 * their seeded roster mid-afternoon is exactly the accident this prevents.
 */
const TEST_DATABASE_NAME = /_test$/i;

function assertTestDatabase(): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('refusing to truncate: NODE_ENV=production');
  }

  const name = new URL(env.DATABASE_URL).pathname.replace(/^\//, '');

  if (!TEST_DATABASE_NAME.test(name)) {
    throw new Error(
      `refusing to truncate database "${name}": the integration suite deletes every row, ` +
        'so its database name must end in "_test". Run `npm run db:test:setup`.',
    );
  }
}

/** Delete every row of one table. The name is a constant from the list below. */
async function wipe(table: string): Promise<void> {
  await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
}

/**
 * Delete every row, in dependency order.
 *
 * Explicit deletes rather than `TRUNCATE ... CASCADE` so that a model added
 * without being listed here shows up as a foreign-key error in the test suite
 * rather than being silently wiped. Raw SQL on purpose: this is the one place
 * that deletes across every event, which the event-scope guard forbids the
 * application (ADR-001 §2).
 */
export async function resetDatabase(): Promise<void> {
  assertTestDatabase();

  await wipe('AuditLog');
  await wipe('IdempotencyRecord');

  await wipe('AnnouncementAck');
  await wipe('Announcement');

  await wipe('LostPersonAck');
  await wipe('LostPersonSummary');
  await wipe('LostPersonAlert');
  await wipe('LostFoundItem');

  await wipe('IncidentFollowUp');
  await wipe('Incident');

  await wipe('GiftStockAdjustment');
  await wipe('GiftRedemption');
  await wipe('GiftType');

  await wipe('CardStampEvent');
  await wipe('Registration');
  await wipe('FootfallTick');
  await wipe('MissionCard');

  await wipe('ShiftSwapRequest');
  await wipe('AttendanceAttempt');
  await wipe('AttendanceChallenge');
  await wipe('Attendance');
  await wipe('ShiftAssignment');
  await wipe('BriefingSlot');

  await wipe('FallbackWindow');
  await wipe('ImportBatch');

  // Session and device state. RefreshSession and PushSubscription cascade from
  // Volunteer, but AppSetting does not — and a settings override left behind by
  // one test would silently retune every test that ran after it.
  await wipe('RefreshSession');
  await wipe('PushSubscription');
  await wipe('AppSetting');

  await wipe('StationTagging');
  await wipe('Station');
  await wipe('StationType');
  await wipe('StationTag');
  await wipe('Shift');
  await wipe('ShiftTemplate');
  await wipe('CaptureCategory');
  await wipe('EventDay');

  // Event #1 and its memberships (P09.3/P09.4), before the people they name.
  await prisma.$executeRawUnsafe('UPDATE "EventMembership" SET "reportsToId" = NULL');
  await wipe('EventMembership');
  await wipe('OrganisationMembership');
  await wipe('Event');

  // Volunteers last: almost everything references them.
  await prisma.$executeRawUnsafe('UPDATE "Volunteer" SET "reportsToId" = NULL');
  await wipe('Volunteer');

  invalidateEventCache();
  invalidateVolunteerCache();
}
