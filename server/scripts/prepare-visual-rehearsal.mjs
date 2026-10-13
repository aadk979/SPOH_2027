import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { FIXTURE_EVENT, SECOND_EVENT } from '../prisma/fixtures/devEvent.js';
import { testDatabaseEnvironment } from '../../scripts/test-database-environment.mjs';

/** Convert only an unused legacy visual fixture; retain its historical dates. */
const { DATABASE_URL: databaseUrl } = testDatabaseEnvironment(process.env);
if (process.env.AUTH_PROVIDER !== 'local' || process.env.DEPLOYMENT_ENV !== 'development' ||
  process.env.SPOH_ALLOW_LOCAL_VISUAL_REHEARSAL !== '1')
  throw new Error('Rehearsal conversion requires explicit local development and SPOH_ALLOW_LOCAL_VISUAL_REHEARSAL=1.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const captures = [
  'registration',
  'footfallTick',
  'cardStampEvent',
  'giftRedemption',
  'incident',
  'lostPersonAlert',
  'lostFoundItem',
  'lostPersonSummary',
  'attendance',
  'attendanceChallenge',
  'giftStockAdjustment',
  'fallbackWindow',
  'importBatch',
];
try {
  await prisma.$transaction(async (tx) => {
    for (const fixture of [FIXTURE_EVENT, SECOND_EVENT]) {
      const eventId = fixture.id;
      const rows = await tx.$queryRaw`SELECT status FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
      const event = rows[0];
      if (!event || !['READY', 'LIVE', 'REHEARSAL'].includes(event.status))
        throw new Error('Expected unused development fixture');
      for (const model of captures) {
        if (await tx[model].count({ where: { eventId } }))
          throw new Error(`Refusing to reclassify existing ${model} captures`);
      }
      if (await tx.missionCard.count({ where: { eventId, status: { not: 'UNISSUED' } } }))
        throw new Error('Refusing to reclassify issued cards');
      await tx.missionCard.updateMany({
        where: { eventId },
        data: { rehearsal: true, batchLabel: 'DEV REHEARSAL' },
      });
      const gifts = await tx.giftType.findMany({ where: { eventId } });
      for (const gift of gifts) {
        if (!gift.initialStock) continue;
        if (gift.rehearsalInitialStock)
          throw new Error('Both stock pools populated; manual fixture review required');
        await tx.giftType.update({
          where: { eventId, id: gift.id },
          data: { initialStock: 0, rehearsalInitialStock: gift.initialStock },
        });
      }
      await tx.event.update({ where: { id: eventId }, data: { status: 'REHEARSAL' } });
    }
  });
  console.log('visual rehearsal fixtures ready; dates and roster retained');
} finally {
  await prisma.$disconnect();
}
