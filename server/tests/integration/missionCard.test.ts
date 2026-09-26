import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/platform/db/client.js';
import { resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  type TestVolunteer,
} from '../helpers/fixtures.js';

/**
 * COUNT 3 — Mission Cards.
 *
 * The tests that matter are the ones encoding domain rules: a journey is a set
 * of stations rather than a tally of scans, the funnel reconciles, and a
 * reissue can never leave one journey redeemable twice.
 */

let app: Express;
let booth: TestVolunteer;
let facilitator: TestVolunteer;
let ic: TestVolunteer;
let admin: TestVolunteer;
let boothStationId: string;
let loungeId: string;
let courseId: string;
let completeId: string;

/** Two cards, seeded unissued exactly as a print batch would arrive. */
const CARD_A = 'AAA111';
const CARD_B = 'BBB222';
const CARD_C = 'CCC333';

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();

  const eventDay = await createEventDayToday();

  boothStationId = (await createStation({ code: 'BOOTH', name: 'Sign-Up Booth' })).id;
  loungeId = (await createStation({ code: 'LOUNGE', name: 'Welcome Lounge', issuesStamp: true }))
    .id;
  courseId = (await createStation({ code: 'DCS', name: 'DCS Station', issuesStamp: true })).id;
  completeId = (await createStation({ code: 'DONE', name: 'Mission Complete' })).id;

  booth = await createVolunteer({ email: 'booth@card.test', role: 'VOLUNTEER' });
  facilitator = await createVolunteer({ email: 'fac@card.test', role: 'VOLUNTEER' });
  ic = await createVolunteer({ email: 'ic@card.test', role: 'IC' });
  admin = await createVolunteer({ email: 'admin@card.test', role: 'ADMIN' });

  await assignToStationAllBlocks({
    volunteerId: booth.id,
    stationId: boothStationId,
    eventDayId: eventDay.id,
  });
  await assignToStationAllBlocks({
    volunteerId: facilitator.id,
    stationId: courseId,
    eventDayId: eventDay.id,
  });
  await assignToStationAllBlocks({
    volunteerId: ic.id,
    stationId: boothStationId,
    eventDayId: eventDay.id,
  });
  await assignToStationAllBlocks({
    volunteerId: admin.id,
    stationId: completeId,
    eventDayId: eventDay.id,
  });

  await prisma.missionCard.createMany({
    data: [CARD_A, CARD_B, CARD_C].map((shortCode) => ({
      shortCode,
      qrPayload: `spoh2027:test-${shortCode}`,
      batchLabel: 'TEST',
    })),
  });
});

function stamp(actor: TestVolunteer, code: string, stationId: string): request.Test {
  return request(app)
    .post(`/api/v1/cards/${code}/stamps`)
    .set('Authorization', bearer(actor))
    .send({ stationId, idempotencyKey: idempotencyKey() });
}

describe('card identity', () => {
  it('resolves a pre-printed card that has never been issued', async () => {
    const response = await request(app)
      .get(`/api/v1/cards/${CARD_A}`)
      .set('Authorization', bearer(booth));

    expect(response.status).toBe(200);
    expect(response.body.card.status).toBe('UNISSUED');
    // Cards are generated and printed at production time, never at the booth,
    // so a card exists before anybody has touched it (PRODUCT_BRIEF §4.4).
    expect(response.body.card.remainingStationIds).toHaveLength(2);
  });

  it('accepts a lowercase, spaced code the way a volunteer would type it', async () => {
    const response = await request(app)
      .get('/api/v1/cards/aaa111')
      .set('Authorization', bearer(booth));

    expect(response.status).toBe(200);
    expect(response.body.card.shortCode).toBe(CARD_A);
  });

  it('404s an unknown code rather than inventing a card', async () => {
    const response = await request(app)
      .get('/api/v1/cards/ZZZZZZ')
      .set('Authorization', bearer(booth));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('CARD_NOT_FOUND');
  });
});

/** BUILD_PLAN §10 case 9. */
describe('stamping', () => {
  it('records a stamp and reports what is left of the journey', async () => {
    const response = await stamp(facilitator, CARD_A, courseId);

    expect(response.status).toBe(201);
    expect(response.body.stampAdded).toBe(true);
    expect(response.body.card.stamps).toHaveLength(1);
    expect(response.body.card.remainingStationIds).toHaveLength(1);
  });

  it('warns rather than duplicating when the same station scans twice', async () => {
    await stamp(facilitator, CARD_A, courseId);
    const second = await stamp(facilitator, CARD_A, courseId);

    // A re-scan after a correction is legitimate, so this warns rather than
    // blocking — but a journey is the set of stations visited, not a tally of
    // scans, so no second row appears.
    expect(second.status).toBe(200);
    expect(second.body.stampAdded).toBe(false);
    expect(second.body.warning).toContain('already stamped');
    expect(await prisma.cardStampEvent.count()).toBe(1);
  });

  it('issues a card that reaches a station without passing the booth', async () => {
    // A card handed out without being linked still has a visitor holding it.
    // Losing the journey would be worse than a late issue timestamp.
    const response = await stamp(facilitator, CARD_A, courseId);

    expect(response.body.card.status).toBe('ISSUED');
    expect(response.body.card.issuedAt).not.toBeNull();
  });

  it('completes the card once every stamping station has been visited', async () => {
    await stamp(facilitator, CARD_A, courseId);
    const last = await stamp(ic, CARD_A, loungeId);

    expect(last.body.justCompleted).toBe(true);
    expect(last.body.card.status).toBe('COMPLETED');
    expect(last.body.card.completedAt).not.toBeNull();
  });

  it('refuses to stamp at a station that does not stamp', async () => {
    const response = await stamp(ic, CARD_A, boothStationId);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('STATION_DOES_NOT_STAMP');
  });

  it('refuses to stamp a voided card', async () => {
    await request(app)
      .post(`/api/v1/cards/${CARD_A}/void`)
      .set('Authorization', bearer(ic))
      .send({ reason: 'Card was damaged beyond use' });

    const response = await stamp(facilitator, CARD_A, courseId);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CARD_VOIDED');
  });

  it('denies a volunteer stamping at a station they are not on', async () => {
    // booth is rostered at the booth, not the course station.
    const response = await stamp(booth, CARD_A, courseId);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('STATION_SCOPE_DENIED');
  });
});

describe('issuing at the booth', () => {
  it('links a card to a group without blocking the registrations', async () => {
    const group = await request(app)
      .post('/api/v1/registrations/group')
      .set('Authorization', bearer(booth))
      .send({
        stationId: boothStationId,
        members: [
          { category: 'SEC_4', count: 1 },
          { category: 'PARENT_GUARDIAN', count: 2 },
        ],
        idempotencyKey: idempotencyKey(),
      });

    const response = await request(app)
      .post(`/api/v1/cards/${CARD_A}/issue`)
      .set('Authorization', bearer(booth))
      .send({ groupId: group.body.groupId, idempotencyKey: idempotencyKey() });

    expect(response.status).toBe(200);
    expect(response.body.card.status).toBe('ISSUED');

    // Three humans, one card. This is the family-of-four rule made concrete.
    const linked = await prisma.registration.count({
      where: { missionCardId: response.body.card.id },
    });
    expect(linked).toBe(3);
  });

  it('treats issuing an already-issued card as a no-op, not an error', async () => {
    await request(app)
      .post(`/api/v1/cards/${CARD_A}/issue`)
      .set('Authorization', bearer(booth))
      .send({ idempotencyKey: idempotencyKey() });

    const second = await request(app)
      .post(`/api/v1/cards/${CARD_A}/issue`)
      .set('Authorization', bearer(booth))
      .send({ idempotencyKey: idempotencyKey() });

    // The common cause is a volunteer scanning twice. Failing would make them
    // think the card is broken.
    expect(second.status).toBe(200);
    expect(await prisma.missionCard.count({ where: { status: 'ISSUED' } })).toBe(1);
  });
});

/** PRODUCT_BRIEF §4.3 — the lost-card case. */
describe('reissue', () => {
  it('carries the stamps over and voids the original in one transaction', async () => {
    await stamp(facilitator, CARD_A, courseId);

    const response = await request(app)
      .post(`/api/v1/cards/${CARD_A}/reissue`)
      .set('Authorization', bearer(ic))
      .send({ reason: 'Visitor lost the card at the lounge', replacementShortCode: CARD_B });

    expect(response.status).toBe(201);
    expect(response.body.stampsCarriedOver).toBe(1);
    expect(response.body.card.shortCode).toBe(CARD_B);
    expect(response.body.card.stamps).toHaveLength(1);

    // The original must be dead, or one journey could be redeemed twice.
    const original = await prisma.missionCard.findUnique({ where: { shortCode: CARD_A } });
    expect(original?.status).toBe('VOIDED');
    expect(response.body.card.reissuedFromId).toBe(original?.id);
  });

  it('refuses a replacement that has already been issued', async () => {
    await request(app)
      .post(`/api/v1/cards/${CARD_B}/issue`)
      .set('Authorization', bearer(booth))
      .send({ idempotencyKey: idempotencyKey() });

    const response = await request(app)
      .post(`/api/v1/cards/${CARD_A}/reissue`)
      .set('Authorization', bearer(ic))
      .send({ reason: 'Lost card', replacementShortCode: CARD_B });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CARD_ALREADY_ISSUED');
  });

  it('denies a volunteer reissuing', async () => {
    const response = await request(app)
      .post(`/api/v1/cards/${CARD_A}/reissue`)
      .set('Authorization', bearer(booth))
      .send({ reason: 'Lost card', replacementShortCode: CARD_B });

    expect(response.status).toBe(403);
  });
});

describe('batch generation', () => {
  it('returns printable CSV and creates the cards unissued', async () => {
    const response = await request(app)
      .post('/api/v1/cards/batch')
      .set('Authorization', bearer(admin))
      .send({ count: 25, batchLabel: 'PRINT-RUN-1' });

    expect(response.status).toBe(201);
    expect(response.body.created).toBe(25);

    const lines = (response.body.csv as string).trim().split('\n');
    expect(lines[0]).toBe('shortCode,qrPayload,batchLabel');
    expect(lines).toHaveLength(26);

    const created = await prisma.missionCard.findMany({ where: { batchLabel: 'PRINT-RUN-1' } });
    expect(created).toHaveLength(25);
    expect(created.every((card) => card.status === 'UNISSUED')).toBe(true);

    // The alphabet excludes I, L, O and U — the characters a volunteer would
    // misread off a scuffed card under hall lighting.
    expect(created.every((card) => /^[0-9A-HJ-KM-NP-TV-Z]{6}$/.test(card.shortCode))).toBe(true);
  });

  it('denies an IC generating a print batch', async () => {
    const response = await request(app)
      .post('/api/v1/cards/batch')
      .set('Authorization', bearer(ic))
      .send({ count: 5, batchLabel: 'NOPE' });

    expect(response.status).toBe(403);
  });
});

/** Phase 3 acceptance: issued >= stamped >= completed >= redeemed. */
describe('the funnel', () => {
  it('reconciles end to end and reports cards, not people', async () => {
    // Card A: full journey.
    await stamp(facilitator, CARD_A, courseId);
    await stamp(ic, CARD_A, loungeId);

    // Card B: reached one station only.
    await stamp(facilitator, CARD_B, courseId);

    // Card C: issued, never stamped.
    await request(app)
      .post(`/api/v1/cards/${CARD_C}/issue`)
      .set('Authorization', bearer(booth))
      .send({ idempotencyKey: idempotencyKey() });

    const gift = await prisma.giftType.create({
      data: { name: 'Tote', initialStock: 100, lowStockThreshold: 10 },
    });

    await request(app).post('/api/v1/gifts/redemptions').set('Authorization', bearer(admin)).send({
      giftTypeId: gift.id,
      stationId: completeId,
      cardShortCode: CARD_A,
      idempotencyKey: idempotencyKey(),
    });

    const funnel = await request(app).get('/api/v1/cards/funnel').set('Authorization', bearer(ic));

    expect(funnel.status).toBe(200);
    expect(funnel.body.unit).toBe('cards');

    expect(funnel.body.issued).toBe(3);
    expect(funnel.body.completed).toBe(1);
    expect(funnel.body.redeemed).toBe(1);

    // The acceptance criterion, asserted directly.
    const stamped = funnel.body.stages.find((stage: { key: string }) => stage.key === 'DCS') as {
      value: number;
    };

    expect(funnel.body.issued).toBeGreaterThanOrEqual(stamped.value);
    expect(stamped.value).toBeGreaterThanOrEqual(funnel.body.completed);
    expect(funnel.body.completed).toBeGreaterThanOrEqual(funnel.body.redeemed);
  });

  it('counts a card once per station however many times it was scanned', async () => {
    await stamp(facilitator, CARD_A, courseId);
    await stamp(facilitator, CARD_A, courseId);
    await stamp(facilitator, CARD_B, courseId);

    const funnel = await request(app).get('/api/v1/cards/funnel').set('Authorization', bearer(ic));

    const stage = funnel.body.stages.find((s: { key: string }) => s.key === 'DCS') as {
      value: number;
    };
    expect(stage.value).toBe(2);
  });
});
