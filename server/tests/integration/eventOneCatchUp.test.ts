import { readFileSync } from 'node:fs';
import pg from 'pg';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { env } from '../../src/config/env.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
} from '../helpers/fixtures.js';
// @ts-expect-error -- a plain ESM script without types; its check is the oracle here.
import { checkEventOne } from '../../../remediation/reports/P09/totals.mjs';

/**
 * P09.5's catch-up migration: rows the old code wrote after the Event #1
 * backfill, without the new columns, get them from the old ones. Captures
 * are written through the API, their new columns wiped the way the old code
 * would have left them, and the migration's SQL must leave the totals check
 * with nothing to flag.
 */
const MIGRATION = readFileSync(
  new URL(
    '../../prisma/migrations/20261001000000_event_one_catch_up/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

async function failures(): Promise<Array<{ name: string; value: number }>> {
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    const results = (await checkEventOne(client)) as Array<{
      name: string;
      ok: boolean;
      value: number;
    }>;
    return results.filter((result) => !result.ok);
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  await resetDatabase();
  const app = createApp();
  const { id: eventDayId } = await createEventDayToday();
  const booth = (await createStation({ code: 'BOOTH' })).id;
  const volunteer = await createVolunteer({ email: 'late@catchup.test', role: 'IC' });
  await assignToStationAllBlocks({ volunteerId: volunteer.id, stationId: booth, eventDayId });
  for (const category of ['SEC_3', 'PARENT_GUARDIAN']) {
    await request(app)
      .post('/api/v1/registrations')
      .set('Authorization', bearer(volunteer))
      .send({ category, stationId: booth, idempotencyKey: idempotencyKey() })
      .expect(201);
  }

  // As the code before P09.5 wrote them: old columns only.
  await rawDb.$executeRawUnsafe(
    'UPDATE "Registration" SET "eventId" = NULL, "categoryId" = NULL, "recordedByMembershipId" = NULL',
  );
  await rawDb.$executeRawUnsafe(
    'UPDATE "ShiftAssignment" SET "eventId" = NULL, "membershipId" = NULL, "shiftId" = NULL',
  );
  await rawDb.$executeRawUnsafe('UPDATE "AuditLog" SET "eventId" = NULL, "membershipId" = NULL');
});

describe('the P09.5 catch-up migration', () => {
  it('starts from rows the totals check flags', async () => {
    expect((await failures()).length).toBeGreaterThan(0);
  });

  it('fills them from the old columns, and a second run changes nothing', async () => {
    await rawDb.$executeRawUnsafe(MIGRATION);
    expect(await failures()).toEqual([]);
    await rawDb.$executeRawUnsafe(MIGRATION);
    expect(await failures()).toEqual([]);
  });
});
