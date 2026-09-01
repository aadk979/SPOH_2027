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
const TEST_DATABASE_PATTERN = /(_test|test_|\/spoh2027_test|localhost|127\.0\.0\.1)/i;

function assertTestDatabase(): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('refusing to truncate: NODE_ENV=production');
  }
  if (!TEST_DATABASE_PATTERN.test(env.DATABASE_URL)) {
    throw new Error(
      'refusing to truncate: DATABASE_URL does not look like a local or test database',
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
