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
 * Gift redemption and inventory.
 *
 * The rule under test throughout: the physical stamped card authorises the
 * gift, the scan is a cross-check, and only genuinely running out of stock is
 * allowed to stop a visitor who has walked the whole journey.
 */

let app: Express;
let volunteer: TestVolunteer;
let ic: TestVolunteer;
let stationId: string;
let giftId: string;
let scarceGiftId: string;

const CARD = 'AAA111';

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();

  const eventDay = await createEventDayToday();
  stationId = (await createStation({ code: 'DONE', name: 'Mission Complete' })).id;

  volunteer = await createVolunteer({ email: 'gift@gift.test', role: 'VOLUNTEER' });
  ic = await createVolunteer({ email: 'ic@gift.test', role: 'IC' });

  await assignToStationAllBlocks({
    volunteerId: volunteer.id,
    stationId,
    eventDayId: eventDay.id,
  });
  await assignToStationAllBlocks({ volunteerId: ic.id, stationId, eventDayId: eventDay.id });

  giftId = (
    await prisma.giftType.create({
      data: { name: 'Tote Bag', initialStock: 100, lowStockThreshold: 10 },
    })
  ).id;

  scarceGiftId = (
    await prisma.giftType.create({
      data: { name: 'Last Badge', initialStock: 1, lowStockThreshold: 1 },
    })
  ).id;

  await prisma.missionCard.create({
    data: {
      shortCode: CARD,
      qrPayload: `spoh2027:test-${CARD}`,
      status: 'ISSUED',
      issuedAt: new Date(),
    },
  });
});

function redeem(actor: TestVolunteer, body: Record<string, unknown> = {}): request.Test {
  return request(app)
    .post('/api/v1/gifts/redemptions')
    .set('Authorization', bearer(actor))
    .send({ giftTypeId: giftId, stationId, idempotencyKey: idempotencyKey(), ...body });
}

describe('stock is derived, never stored', () => {
  it('reports remaining as initial minus redemptions', async () => {
    await redeem(volunteer);
    await redeem(volunteer);

    const response = await request(app)
      .get('/api/v1/gifts')
      .set('Authorization', bearer(volunteer));

    const tote = (
      response.body.data as Array<{ name: string; remaining: number; redeemed: number }>
    ).find((gift) => gift.name === 'Tote Bag');

    expect(tote?.redeemed).toBe(2);
    expect(tote?.remaining).toBe(98);
  });

  it('follows an adjustment without drifting', async () => {
    await redeem(volunteer);

    const adjusted = await request(app)
      .post(`/api/v1/gifts/${giftId}/adjust`)
      .set('Authorization', bearer(ic))
      .send({ delta: -50, reason: 'Box count corrected after delivery' });

    // 100 initial − 50 adjustment − 1 redeemed. A stored counter would have
    // drifted the moment the two changes disagreed.
    expect(adjusted.body.giftType.remaining).toBe(49);
  });

  it('flags low stock at the threshold', async () => {
    await request(app)
      .post(`/api/v1/gifts/${giftId}/adjust`)
      .set('Authorization', bearer(ic))
      .send({ delta: -95, reason: 'Most of the stock went to the other campus' });

    const response = await request(app)
      .get('/api/v1/gifts')
      .set('Authorization', bearer(volunteer));

    const tote = (response.body.data as Array<{ name: string; lowStock: boolean }>).find(
      (gift) => gift.name === 'Tote Bag',
    );
    expect(tote?.lowStock).toBe(true);
  });

  it('denies a volunteer adjusting stock', async () => {
    const response = await request(app)
      .post(`/api/v1/gifts/${giftId}/adjust`)
      .set('Authorization', bearer(volunteer))
      .send({ delta: 100, reason: 'More arrived' });

    expect(response.status).toBe(403);
  });
});

/** BUILD_PLAN §10 case 10. */
describe('out of stock', () => {
  it('returns a domain error, not a 500', async () => {
    await redeem(volunteer, { giftTypeId: scarceGiftId });
    const response = await redeem(volunteer, { giftTypeId: scarceGiftId });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('GIFT_OUT_OF_STOCK');
    // The volunteer sees "we have run out", not "something went wrong".
    expect(response.body.error.message).toContain('out of stock');
  });

  it('records nothing when stock is exhausted', async () => {
    await redeem(volunteer, { giftTypeId: scarceGiftId });
    await redeem(volunteer, { giftTypeId: scarceGiftId });

    expect(await prisma.giftRedemption.count({ where: { giftTypeId: scarceGiftId } })).toBe(1);
  });
});

describe('the card is a cross-check, never a gate', () => {
  it('redeems without a card at all', async () => {
    const response = await redeem(volunteer);

    expect(response.status).toBe(201);
    expect(response.body.redemption.missionCardId).toBeNull();
  });

  it('redeems and warns when the card code does not resolve', async () => {
    const response = await redeem(volunteer, { cardShortCode: 'ZZZZZZ' });

    // A card that will not scan must never stop a visitor who walked the
    // journey. The gift is recorded; only the journey link is lost.
    expect(response.status).toBe(201);
    expect(response.body.warning).toContain('not found');
    expect(response.body.redemption.missionCardId).toBeNull();
  });

  it('redeems and warns when the card is not complete', async () => {
    const response = await redeem(volunteer, { cardShortCode: CARD });

    expect(response.status).toBe(201);
    expect(response.body.cardComplete).toBe(false);
    expect(response.body.warning).toContain('not yet complete');
  });

  it('blocks a duplicate redemption until the volunteer confirms', async () => {
    await redeem(volunteer, { cardShortCode: CARD });
    const second = await redeem(volunteer, { cardShortCode: CARD });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('GIFT_ALREADY_REDEEMED');
  });

  it('allows the duplicate once acknowledged, and says so in the record', async () => {
    await redeem(volunteer, { cardShortCode: CARD });
    const second = await redeem(volunteer, { cardShortCode: CARD, acknowledgeWarning: true });

    expect(second.status).toBe(201);
    expect(second.body.warning).toContain('confirmed by the volunteer');
    expect(await prisma.giftRedemption.count({ where: { voided: false } })).toBe(2);
  });
});

describe('audit and attribution', () => {
  it('writes an audit row for every redemption', async () => {
    await redeem(volunteer);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'gift.redeem' } });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(volunteer.id);
  });

  it('attributes the redemption to the token, not the body', async () => {
    await redeem(volunteer);

    const row = await prisma.giftRedemption.findFirst();
    expect(row?.recordedById).toBe(volunteer.id);
  });

  it('is idempotent on replay', async () => {
    const key = idempotencyKey();

    await request(app)
      .post('/api/v1/gifts/redemptions')
      .set('Authorization', bearer(volunteer))
      .send({ giftTypeId: giftId, stationId, idempotencyKey: key });

    await request(app)
      .post('/api/v1/gifts/redemptions')
      .set('Authorization', bearer(volunteer))
      .send({ giftTypeId: giftId, stationId, idempotencyKey: key });

    expect(await prisma.giftRedemption.count()).toBe(1);
  });
});
