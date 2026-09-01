import { env } from '../../src/config/env.js';
import { prisma } from '../../src/lib/prisma.js';

/**
 * Test database helpers.
 *
 * The guard below is the important part: these functions delete every row in
 * the database, and running them against a real one would destroy an event's
 * worth of data. They refuse to run unless the connection string names a
 * database that looks like a test database.
 */
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

/**
 * Delete every row, in dependency order.
 *
 * Explicit deletes rather than `TRUNCATE ... CASCADE` so that a model added
 * without being listed here shows up as a foreign-key error in the test suite
 * rather than being silently wiped.
 */
export async function resetDatabase(): Promise<void> {
  assertTestDatabase();

  await prisma.auditLog.deleteMany();
  await prisma.idempotencyRecord.deleteMany();

  await prisma.announcementAck.deleteMany();
  await prisma.announcement.deleteMany();

  await prisma.lostPersonAck.deleteMany();
  await prisma.lostPersonSummary.deleteMany();
  await prisma.lostPersonAlert.deleteMany();
  await prisma.lostFoundItem.deleteMany();

  await prisma.incidentFollowUp.deleteMany();
  await prisma.incident.deleteMany();

  await prisma.giftStockAdjustment.deleteMany();
  await prisma.giftRedemption.deleteMany();
  await prisma.giftType.deleteMany();

  await prisma.cardStampEvent.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.footfallTick.deleteMany();
  await prisma.missionCard.deleteMany();

  await prisma.shiftSwapRequest.deleteMany();
  await prisma.shiftAssignment.deleteMany();
  await prisma.briefingSlot.deleteMany();

  await prisma.fallbackWindow.deleteMany();
  await prisma.importBatch.deleteMany();

  await prisma.station.deleteMany();
  await prisma.eventDay.deleteMany();

  // Volunteers last: almost everything references them.
  await prisma.volunteer.updateMany({ data: { reportsToId: null } });
  await prisma.volunteer.deleteMany();
}
