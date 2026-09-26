import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { prisma } from '../../../src/platform/db/client.js';
import { resetDatabase } from '../../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  type TestVolunteer,
} from '../../helpers/fixtures.js';

/**
 * P03 bug reproductions: Mission Cards, gifts and group registration.
 * Skipped until fixed; each asserts the correct behaviour and fails today.
 */

let app: Express;
let volunteer: TestVolunteer;
let stamper: TestVolunteer;
let ic: TestVolunteer;
let chief: TestVolunteer;
let deskId: string;
let boothAId: string;
let giftId: string;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();
  const day = await createEventDayToday();

  deskId = (await createStation({ code: 'DESK', name: 'Registration desk' })).id;
  boothAId = (await createStation({ code: 'BOOTHA', issuesStamp: true })).id;

  volunteer = await createVolunteer({ email: 'v@capture.test', role: 'VOLUNTEER' });
  stamper = await createVolunteer({ email: 'stamper@capture.test', role: 'VOLUNTEER' });
  ic = await createVolunteer({ email: 'ic@capture.test', role: 'IC' });
  chief = await createVolunteer({ email: 'chief@capture.test', role: 'CHIEF_COORDINATOR' });
  // One station per person per block: the desk volunteer registers and hands
  // out gifts, the stamper works booth A.
  await assignToStationAllBlocks({
    volunteerId: volunteer.id,
    stationId: deskId,
    eventDayId: day.id,
  });
  await assignToStationAllBlocks({
    volunteerId: stamper.id,
    stationId: boothAId,
    eventDayId: day.id,
  });

  giftId = (
    await prisma.giftType.create({
      data: { name: 'Tote Bag', initialStock: 100, lowStockThreshold: 1 },
    })
  ).id;
});

async function card(shortCode: string, status: 'UNISSUED' | 'ISSUED' | 'COMPLETED' | 'VOIDED') {
  return prisma.missionCard.create({
    data: {
      shortCode,
      qrPayload: `spoh2027:repro-${shortCode}`,
      status,
      ...(status === 'UNISSUED' ? {} : { issuedAt: new Date() }),
      ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}),
      ...(status === 'VOIDED' ? { voidedAt: new Date() } : {}),
    },
  });
}

function stamp(shortCode: string, stationId: string): request.Test {
  return request(app)
    .post(`/api/v1/cards/${shortCode}/stamps`)
    .set('Authorization', bearer(stamper))
    .send({ stationId, idempotencyKey: idempotencyKey() });
}

function reissue(original: string, replacement: string): request.Test {
  return request(app)
    .post(`/api/v1/cards/${original}/reissue`)
    .set('Authorization', bearer(ic))
    .send({ reason: 'Visitor lost the card', replacementShortCode: replacement });
}

function redeem(body: Record<string, unknown>): request.Test {
  return request(app)
    .post('/api/v1/gifts/redemptions')
    .set('Authorization', bearer(volunteer))
    .send({ giftTypeId: giftId, stationId: deskId, idempotencyKey: idempotencyKey(), ...body });
}

describe('Mission Cards, gifts and group registration (P03 repros)', () => {
  // F03-003
  it.skip('warns before a second gift when the redeemed card has been reissued', async () => {
    await card('AAA111', 'COMPLETED');
    await card('BBB222', 'UNISSUED');

    expect((await redeem({ cardShortCode: 'AAA111' })).status).toBe(201);
    expect((await reissue('AAA111', 'BBB222')).status).toBe(201);

    const second = await redeem({ cardShortCode: 'BBB222' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('GIFT_ALREADY_REDEEMED');
  });

  // F03-004
  it.skip('leaves a completed card completed when a group registration links it', async () => {
    await card('CCC333', 'COMPLETED');

    const response = await request(app)
      .post('/api/v1/registrations/group')
      .set('Authorization', bearer(volunteer))
      .send({
        stationId: deskId,
        idempotencyKey: idempotencyKey(),
        members: [{ category: 'SEC_3', count: 2 }],
        missionCardShortCode: 'CCC333',
      });
    expect(response.status).toBe(201);

    const row = await prisma.missionCard.findUniqueOrThrow({ where: { shortCode: 'CCC333' } });
    expect(row.status).toBe('COMPLETED');
  });

  // F03-027
  it.skip('refuses to reissue from a card that was voided', async () => {
    await card('DDD444', 'VOIDED');
    await card('EEE555', 'UNISSUED');

    const response = await reissue('DDD444', 'EEE555');
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CARD_VOIDED');
  });

  // F03-028
  it.skip('counts a reissued journey once in the card funnel', async () => {
    await card('FFF666', 'ISSUED');
    await card('GGG777', 'UNISSUED');
    expect((await stamp('FFF666', boothAId)).status).toBe(201);
    expect((await reissue('FFF666', 'GGG777')).status).toBe(201);

    const funnel = await request(app)
      .get('/api/v1/cards/funnel')
      .set('Authorization', bearer(chief));
    expect(funnel.status).toBe(200);
    expect(funnel.body.issued).toBe(1);
    expect(funnel.body.voided).toBe(0);
    const boothA = (funnel.body.stages as Array<{ key: string; value: number }>).find(
      (stage) => stage.key === 'BOOTHA',
    );
    expect(boothA?.value).toBe(1);
  });

  // F03-020
  it.skip('reads a typed O as 0 and I as 1 in a card code, as the printed alphabet intends', async () => {
    await card('100000', 'ISSUED');

    const response = await request(app)
      .get('/api/v1/cards/IOOOOO')
      .set('Authorization', bearer(volunteer));
    expect(response.status).toBe(200);
    expect(response.body.card.shortCode).toBe('100000');
  });

  // F03-008
  it.skip('answers simultaneous stamps of one card at one station without a 500', async () => {
    // A race: five rounds of three make it lose every run.
    const codes = ['HHH801', 'HHH802', 'HHH803', 'HHH804', 'HHH805'];
    const statuses: number[] = [];
    for (const code of codes) {
      await card(code, 'ISSUED');
      const round = await Promise.all([1, 2, 3].map(() => stamp(code, boothAId)));
      statuses.push(...round.map((response) => response.status));
    }

    expect(statuses.filter((status) => status >= 500)).toEqual([]);
    expect(await prisma.cardStampEvent.count()).toBe(codes.length);
  });

  // F03-007
  it.skip('never hands out more gifts than are in stock under simultaneous redemptions', async () => {
    await prisma.giftType.update({ where: { id: giftId }, data: { initialStock: 1 } });

    const responses = await Promise.all([redeem({}), redeem({}), redeem({}), redeem({})]);
    expect(responses.filter((response) => response.status === 201).length).toBe(1);
    expect(await prisma.giftRedemption.count({ where: { giftTypeId: giftId } })).toBe(1);
  });

  // F03-007
  it.skip('never records two gifts for one card under simultaneous redemptions', async () => {
    // A race: one round does not always lose it, five rounds of four do.
    const codes = ['JJJ901', 'JJJ902', 'JJJ903', 'JJJ904', 'JJJ905'];
    for (const code of codes) {
      await card(code, 'COMPLETED');
      await Promise.all([1, 2, 3, 4].map(() => redeem({ cardShortCode: code })));
    }

    const perCard = await prisma.giftRedemption.groupBy({
      by: ['missionCardId'],
      _count: { _all: true },
    });
    expect(perCard.map((row) => row._count._all)).toEqual([1, 1, 1, 1, 1]);
  });
});
