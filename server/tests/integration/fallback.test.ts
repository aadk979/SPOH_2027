import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

/**
 * Fallback windows and reconciliation (PRODUCT_BRIEF §11).
 *
 * The rule these tests defend: **never silently blend sources.** Imported rows
 * are source-tagged, every summary overlapping a window says so, and re-running
 * an import creates nothing new.
 */

let app: Express;
let volunteer: TestVolunteer;
let ic: TestVolunteer;
let dc: TestVolunteer;
let chief: TestVolunteer;
let boothStationId: string;
let roomAId: string;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();

  const eventDay = await createEventDayToday();
  boothStationId = (await createStation({ code: 'BOOTH', name: 'Sign-Up Booth' })).id;
  roomAId = (await createStation({ code: 'ROOM_A', name: 'Room A', countsEntry: true })).id;

  volunteer = await createVolunteer({ email: 'v@fb.test', role: 'VOLUNTEER' });
  ic = await createVolunteer({ email: 'ic@fb.test', role: 'IC' });
  dc = await createVolunteer({ email: 'dc@fb.test', role: 'DEPUTY_COORDINATOR' });
  chief = await createVolunteer({ email: 'chief@fb.test', role: 'CHIEF_COORDINATOR' });

  await assignToStationAllBlocks({
    volunteerId: volunteer.id,
    stationId: boothStationId,
    eventDayId: eventDay.id,
  });
});

function declare(actor: TestVolunteer, body: Record<string, unknown> = {}): request.Test {
  return request(app)
    .post('/api/v1/fallback/windows')
    .set('Authorization', bearer(actor))
    .send({ tier: 3, reason: 'Backend unreachable from the booth', ...body });
}

/** PRODUCT_BRIEF §11.1 — escalation is declared by command, not by volunteers. */
describe('who may declare a tier', () => {
  it('denies a volunteer', async () => {
    expect((await declare(volunteer)).status).toBe(403);
  });

  it('denies an IC', async () => {
    // Individual stations deciding to switch systems is how the same visitor
    // ends up counted in three places.
    expect((await declare(ic)).status).toBe(403);
  });

  it('allows a Deputy Coordinator', async () => {
    expect((await declare(dc)).status).toBe(201);
  });

  it('allows the Chief', async () => {
    expect((await declare(chief)).status).toBe(201);
  });
});

describe('declaring and closing', () => {
  it('records tier, scope and reason', async () => {
    const response = await declare(chief, { tier: 4, stationId: roomAId });

    expect(response.body.window.tier).toBe(4);
    expect(response.body.window.stationName).toBe('Room A');
    expect(response.body.window.open).toBe(true);
    expect(response.body.window.declaredByName).toBe(chief.email);
  });

  it('accepts a backdated start, because degraded operation precedes the declaration', async () => {
    const startedAt = new Date(FROZEN_NOW.getTime() - 20 * 60_000).toISOString();
    const response = await declare(chief, { startedAt });

    expect(response.body.window.startedAt).toBe(startedAt);
  });

  it('refuses a second open window for the same scope', async () => {
    await declare(chief);
    const second = await declare(chief);

    // Two overlapping windows would make "was this hour degraded" ambiguous,
    // which is the one question the window exists to answer.
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('FALLBACK_ALREADY_OPEN');
  });

  it('allows a station window alongside an event-wide one', async () => {
    await declare(chief);
    const scoped = await declare(chief, { stationId: roomAId });

    expect(scoped.status).toBe(201);
  });

  it('computes the duration on close', async () => {
    const declared = await declare(chief, {
      startedAt: new Date(FROZEN_NOW.getTime() - 45 * 60_000).toISOString(),
    });

    const closed = await request(app)
      .post(`/api/v1/fallback/windows/${declared.body.window.id}/close`)
      .set('Authorization', bearer(chief))
      .send({});

    expect(closed.body.window.open).toBe(false);
    expect(closed.body.window.durationMinutes).toBe(45);
  });

  it('refuses to close the same window twice', async () => {
    const declared = await declare(chief);

    await request(app)
      .post(`/api/v1/fallback/windows/${declared.body.window.id}/close`)
      .set('Authorization', bearer(chief))
      .send({});

    const second = await request(app)
      .post(`/api/v1/fallback/windows/${declared.body.window.id}/close`)
      .set('Authorization', bearer(chief))
      .send({});

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('FALLBACK_ALREADY_CLOSED');
  });

  it('refuses an end before the start', async () => {
    const declared = await declare(chief);

    const response = await request(app)
      .post(`/api/v1/fallback/windows/${declared.body.window.id}/close`)
      .set('Authorization', bearer(chief))
      .send({ endedAt: new Date(FROZEN_NOW.getTime() - 60 * 60_000).toISOString() });

    expect(response.status).toBe(400);
  });

  it('writes an audit row for the declaration', async () => {
    await declare(chief);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'fallback.declare' } });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(chief.id);
  });
});

/** BUILD_PLAN §10 case 8. */
describe('summaries flag data from a fallback window', () => {
  it('flags a registration summary that overlaps an open window', async () => {
    const clean = await request(app)
      .get('/api/v1/registrations/summary?groupBy=category')
      .set('Authorization', bearer(ic));
    expect(clean.body.containsFallbackData).toBe(false);

    await declare(chief);

    const flagged = await request(app)
      .get('/api/v1/registrations/summary?groupBy=category')
      .set('Authorization', bearer(ic));
    expect(flagged.body.containsFallbackData).toBe(true);
  });

  it('does not taint a different station with a station-scoped window', async () => {
    await declare(chief, { stationId: roomAId });

    const booth = await request(app)
      .get(`/api/v1/registrations/summary?groupBy=category&stationId=${boothStationId}`)
      .set('Authorization', bearer(ic));

    expect(booth.body.containsFallbackData).toBe(false);
  });
});

describe('registration import', () => {
  function importRegistrations(
    actor: TestVolunteer,
    body: Record<string, unknown> = {},
  ): request.Test {
    return request(app)
      .post('/api/v1/fallback/imports/registrations')
      .set('Authorization', bearer(actor))
      .send({
        source: 'FALLBACK_SHEET',
        fileName: 'FALLBACK_Registration.csv',
        rows: [
          {
            category: 'SEC_4',
            stationCode: 'BOOTH',
            recordedAt: FROZEN_NOW.toISOString(),
            count: 3,
          },
          {
            category: 'PARENT_GUARDIAN',
            stationCode: 'BOOTH',
            timeBlockStart: FROZEN_NOW.toISOString(),
            count: 2,
          },
        ],
        ...body,
      });
  }

  it('denies a Deputy Coordinator — imports are Chief and Admin only', async () => {
    expect((await importRegistrations(dc)).status).toBe(403);
  });

  it('previews without writing anything', async () => {
    const response = await importRegistrations(chief);

    expect(response.status).toBe(200);
    expect(response.body.committed).toBe(false);
    expect(response.body.recordsCreated).toBe(5);

    // A dry run applies inside a transaction that is rolled back, so the
    // preview is truthful without leaving a trace.
    expect(await prisma.registration.count()).toBe(0);
  });

  it('writes source-tagged rows on commit', async () => {
    const response = await importRegistrations(chief, { commit: true });

    expect(response.status).toBe(201);
    expect(response.body.recordsCreated).toBe(5);

    const rows = await prisma.registration.findMany();
    expect(rows).toHaveLength(5);
    // Never indistinguishable from an app tap.
    expect(rows.every((row) => row.source === 'FALLBACK_SHEET')).toBe(true);
    expect(rows.filter((row) => row.category === 'SEC_4')).toHaveLength(3);
  });

  it('is safe to re-run after a partial failure', async () => {
    await importRegistrations(chief, { commit: true });
    const second = await importRegistrations(chief, { commit: true });

    // Keys are derived from the row content, so "run it again" creates nothing.
    // Reconciliation happens under time pressure and has to be forgiving.
    expect(second.body.recordsCreated).toBe(0);
    expect(second.body.recordsSkipped).toBe(5);
    expect(await prisma.registration.count()).toBe(5);
  });

  it('reports an unknown station rather than guessing', async () => {
    const response = await importRegistrations(chief, {
      rows: [
        {
          category: 'SEC_4',
          stationCode: 'NOWHERE',
          recordedAt: FROZEN_NOW.toISOString(),
          count: 1,
        },
      ],
    });

    expect(response.body.recordsCreated).toBe(0);
    expect(response.body.issues[0].field).toBe('stationCode');
  });

  it('records an ImportBatch so the report can cite it', async () => {
    const response = await importRegistrations(chief, { commit: true });

    const batch = await prisma.importBatch.findUnique({
      where: { id: response.body.importBatchId as string },
    });

    expect(batch?.source).toBe('FALLBACK_SHEET');
    expect(batch?.targetTable).toBe('Registration');
    expect(batch?.fileName).toBe('FALLBACK_Registration.csv');
  });
});

describe('footfall import', () => {
  function importFootfall(body: Record<string, unknown> = {}): request.Test {
    return request(app)
      .post('/api/v1/fallback/imports/footfall')
      .set('Authorization', bearer(chief))
      .send({
        source: 'PAPER',
        fileName: 'paper-tally-room-a.csv',
        rows: [{ stationCode: 'ROOM_A', quantity: 42, timeBlockStart: FROZEN_NOW.toISOString() }],
        ...body,
      });
  }

  it('writes one row with a quantity, not forty-two ticks', async () => {
    await importFootfall({ commit: true });

    const rows = await prisma.footfallTick.findMany();
    // Splitting a block total into individual ticks would invent a precision
    // the paper tally never had.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.quantity).toBe(42);
    expect(rows[0]?.source).toBe('PAPER');
    expect(rows[0]?.timeBlockStart).not.toBeNull();
  });

  it('places the total at the start of its block, not when it was typed in', async () => {
    await importFootfall({ commit: true });

    const row = await prisma.footfallTick.findFirst();
    // Otherwise the curve grows a spike at whatever time the IC did the data
    // entry, usually the end of the shift.
    expect(row?.recordedAt.toISOString()).toBe(FROZEN_NOW.toISOString());
  });

  it('shows up in the footfall total with its source visible', async () => {
    await importFootfall({ commit: true });

    const summary = await request(app)
      .get('/api/v1/footfall/summary?bucket=30m')
      .set('Authorization', bearer(ic));

    expect(summary.body.total).toBe(42);
  });
});
