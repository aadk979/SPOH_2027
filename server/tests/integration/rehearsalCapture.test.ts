import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { captureProvenance } from '../../src/platform/db/captureProvenance.js';
import { prisma } from '../../src/platform/db/client.js';
import { purgeResolvedAlerts } from '../../src/modules/lostPerson/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  membershipOf,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
let admin: TestVolunteer;
let eventId: string;
let stationId: string;
let dayId: string;
const post = (path: string, body: object = {}) =>
  request(app)
    .post(`/api/v1/events/${eventId}${path}`)
    .set('Authorization', bearer(admin))
    .send(body);
const get = (path: string) =>
  request(app).get(`/api/v1/events/${eventId}${path}`).set('Authorization', bearer(admin));
const phase = (status: 'LIVE' | 'REHEARSAL') =>
  rawDb.event.update({ where: { id: eventId }, data: { status } });
const stock = async () =>
  (await get('/gifts')).body.data[0] as { remaining: number; rehearsal: boolean };
const redeem = (giftTypeId: string, cardShortCode?: string) =>
  post('/gifts/redemptions', {
    giftTypeId,
    stationId,
    cardShortCode,
    idempotencyKey: idempotencyKey(),
    acknowledgeWarning: true,
  });

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'admin@rehearsal.test', role: 'ADMIN' });
  dayId = (await createEventDayToday()).id;
  stationId = (await createStation({ code: 'practice', countsEntry: true, issuesStamp: true })).id;
  await phase('REHEARSAL');
});

describe('rehearsal capture provenance', () => {
  it('refuses queued practice counts and gifts after the event changes mode', async () => {
    const gift = await rawDb.giftType.create({ data: { eventId, name: 'Gift', initialStock: 10 } });
    await phase('LIVE');
    expect(
      (
        await post('/registrations', {
          stationId,
          category: 'SEC_4',
          rehearsal: true,
          idempotencyKey: idempotencyKey(),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await post('/footfall/ticks', {
          stationId,
          rehearsal: true,
          idempotencyKey: idempotencyKey(),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await post('/gifts/redemptions', {
          stationId,
          giftTypeId: gift.id,
          queued: true,
          rehearsal: true,
          idempotencyKey: idempotencyKey(),
        })
      ).status,
    ).toBe(409);
    expect(await rawDb.registration.count()).toBe(0);
    expect(await rawDb.footfallTick.count()).toBe(0);
    expect(await rawDb.giftRedemption.count()).toBe(0);
    await phase('REHEARSAL');
    expect(
      (
        await post('/footfall/ticks', {
          stationId,
          rehearsal: false,
          idempotencyKey: idempotencyKey(),
        })
      ).status,
    ).toBe(409);
  });

  it('tags imports and keeps repeated practice filenames distinct from live imports', async () => {
    const body = {
      source: 'PAPER',
      commit: true,
      fileName: 'tallies.csv',
      rows: [{ stationCode: 'practice', quantity: 7, timeBlockStart: FROZEN_NOW.toISOString() }],
    };
    const first = await post('/fallback/imports/footfall', body);
    expect(first.status).toBe(201);
    expect(first.body.recordsCreated).toBe(1);
    expect((await rawDb.importBatch.findFirstOrThrow()).rehearsal).toBe(true);
    expect((await rawDb.footfallTick.findFirstOrThrow()).rehearsal).toBe(true);
    expect((await post('/fallback/imports/footfall', body)).body.recordsCreated).toBe(0);
    await phase('LIVE');
    expect((await post('/fallback/imports/footfall', body)).body.recordsCreated).toBe(1);
    expect(await rawDb.footfallTick.count({ where: { eventId, rehearsal: false } })).toBe(1);
    expect((await post('/fallback/imports/footfall', body)).body.recordsCreated).toBe(0);
  });

  it('retains a practice window provenance when its registration sheet is imported live', async () => {
    const declared = await post('/fallback/windows', { tier: 4, reason: 'Practice paper tally' });
    expect(declared.status).toBe(201);
    expect(declared.body.window.rehearsal).toBe(true);
    const closed = await post(`/fallback/windows/${declared.body.window.id}/close`);
    expect(closed.body.window.rehearsal).toBe(true);
    await phase('LIVE');
    expect((await get('/fallback/windows')).body.data).toEqual([
      expect.objectContaining({ id: declared.body.window.id, rehearsal: true, open: false }),
    ]);
    const body = {
      source: 'PAPER',
      commit: true,
      fileName: 'practice-registration.csv',
      fallbackWindowId: declared.body.window.id,
      rows: [
        {
          stationCode: 'practice',
          category: 'SEC_4',
          count: 2,
          timeBlockStart: FROZEN_NOW.toISOString(),
        },
      ],
    };
    expect(
      (
        await post('/fallback/imports/registrations', {
          ...body,
          fallbackWindowId: undefined,
          rehearsal: true,
        })
      ).status,
    ).toBe(409);
    expect((await post('/fallback/imports/registrations', body)).status).toBe(201);
    expect(await rawDb.registration.count({ where: { eventId, rehearsal: true } })).toBe(2);
    expect(await rawDb.registration.count({ where: { eventId, rehearsal: false } })).toBe(0);
    expect((await rawDb.importBatch.findFirstOrThrow()).rehearsal).toBe(true);
    expect(
      (
        await post('/fallback/imports/registrations', {
          ...body,
          fallbackWindowId: 'unknown-window',
        })
      ).status,
    ).toBe(404);
    expect(
      (await post('/fallback/imports/registrations', { ...body, source: 'FALLBACK_SHEET' })).status,
    ).toBe(400);
  });

  it('copies practice stamp provenance when reissuing a practice card', async () => {
    await rawDb.missionCard.createMany({
      data: ['ABC234', 'DEF234'].map((shortCode) => ({
        eventId,
        shortCode,
        qrPayload: `practice-${shortCode}`,
        rehearsal: true,
      })),
    });
    expect(
      (
        await post('/cards/ABC234/stamps', {
          stationId,
          rehearsal: true,
          idempotencyKey: idempotencyKey(),
        })
      ).status,
    ).toBe(201);
    const reissued = await post('/cards/ABC234/reissue', {
      replacementShortCode: 'DEF234',
      reason: 'Practice lost card',
    });
    expect(reissued.status).toBe(201);
    expect(reissued.body.stampsCarriedOver).toBe(1);
    const stamps = await rawDb.cardStampEvent.findMany({ where: { eventId } });
    expect(stamps).toHaveLength(2);
    expect(stamps.every((stamp) => stamp.rehearsal)).toBe(true);
  });

  it('tags single/group registration, tap/bulk footfall, safety, cards and fallback windows', async () => {
    expect(
      (
        await post('/registrations', {
          stationId,
          category: 'SEC_4',
          idempotencyKey: idempotencyKey(),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await post('/registrations/group', {
          stationId,
          members: [{ category: 'SEC_4', count: 2 }],
          idempotencyKey: idempotencyKey(),
        })
      ).status,
    ).toBe(201);
    expect(
      (await post('/footfall/ticks', { stationId, idempotencyKey: idempotencyKey() })).status,
    ).toBe(201);
    expect(
      (
        await post('/footfall/bulk', {
          stationId,
          quantity: 8,
          source: 'PAPER',
          timeBlockStart: FROZEN_NOW.toISOString(),
          reason: 'Practice clicker total',
          idempotencyKey: idempotencyKey(),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await post('/incidents', {
          type: 'OTHER',
          severity: 'LOW',
          description: 'Practice incident',
          occurredAt: FROZEN_NOW.toISOString(),
          stationId,
          idempotencyKey: idempotencyKey(),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await post('/lost-person', {
          descriptionText: 'Practice alert',
          lastSeenStationId: stationId,
          idempotencyKey: idempotencyKey(),
        })
      ).status,
    ).toBe(201);
    expect(
      (await post('/lost-found', { itemLabel: 'Practice bottle', foundStationId: stationId }))
        .status,
    ).toBe(201);
    expect(
      (
        await post('/cards/batch', {
          count: 2,
          batchLabel: 'Practice batch',
          rehearsal: true,
          idempotencyKey: idempotencyKey(),
        })
      ).status,
    ).toBe(201);
    expect(
      (await post('/fallback/windows', { tier: 4, reason: 'Practice paper tally' })).status,
    ).toBe(201);
    for (const rows of [
      await rawDb.registration.findMany(),
      await rawDb.footfallTick.findMany(),
      await rawDb.incident.findMany(),
      await rawDb.lostPersonAlert.findMany(),
      await rawDb.lostFoundItem.findMany(),
      await rawDb.missionCard.findMany(),
      await rawDb.fallbackWindow.findMany(),
    ]) {
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.rehearsal)).toBe(true);
    }
  });

  it('keeps stock adjustments and redemptions in their own inventory', async () => {
    const gift = await rawDb.giftType.create({ data: { eventId, name: 'Gift', initialStock: 10 } });
    expect(await stock()).toMatchObject({ remaining: 0, rehearsal: true });
    expect((await redeem(gift.id)).status).toBe(409);
    expect(
      (await post(`/gifts/${gift.id}/adjust`, { delta: 3, reason: 'Practice delivery' })).status,
    ).toBe(200);
    expect((await redeem(gift.id)).status).toBe(201);
    expect(await stock()).toMatchObject({ remaining: 2, rehearsal: true });
    expect((await rawDb.giftRedemption.findFirstOrThrow()).rehearsal).toBe(true);
    expect((await rawDb.giftStockAdjustment.findFirstOrThrow()).rehearsal).toBe(true);
    await phase('LIVE');
    expect(await stock()).toMatchObject({ remaining: 10, rehearsal: false });
    expect((await redeem(gift.id)).status).toBe(201);
    expect(await stock()).toMatchObject({ remaining: 9, rehearsal: false });
    await phase('REHEARSAL');
    expect(await stock()).toMatchObject({ remaining: 2, rehearsal: true });
  });

  it('refuses the wrong card mode for issue, stamp, reissue and redemption', async () => {
    await rawDb.missionCard.createMany({
      data: [
        { eventId, shortCode: 'ABC234', qrPayload: 'live', status: 'ISSUED' },
        { eventId, shortCode: 'DEF234', qrPayload: 'practice', rehearsal: true },
      ],
    });
    const gift = await rawDb.giftType.create({
      data: { eventId, name: 'Gift', initialStock: 10, rehearsalInitialStock: 10 },
    });
    expect((await post('/cards/ABC234/issue', { idempotencyKey: idempotencyKey() })).status).toBe(
      409,
    );
    expect(
      (await post('/cards/ABC234/stamps', { stationId, idempotencyKey: idempotencyKey() })).status,
    ).toBe(409);
    expect(
      (
        await post('/cards/ABC234/reissue', {
          replacementShortCode: 'DEF234',
          reason: 'Practice replacement',
        })
      ).status,
    ).toBe(409);
    expect((await redeem(gift.id, 'ABC234')).status).toBe(409);
    expect(
      (await post('/cards/DEF234/stamps', { stationId, idempotencyKey: idempotencyKey() })).status,
    ).toBe(201);
    expect((await rawDb.cardStampEvent.findFirstOrThrow()).rehearsal).toBe(true);
    await phase('LIVE');
    expect(
      (await post('/cards/DEF234/stamps', { stationId, idempotencyKey: idempotencyKey() })).status,
    ).toBe(409);
    expect((await redeem(gift.id, 'DEF234')).status).toBe(409);
    expect(await rawDb.giftRedemption.count()).toBe(0);
  });

  it('retains practice provenance in summaries even when purged after go-live', async () => {
    const response = await post('/lost-person', {
      descriptionText: 'Practice alert',
      idempotencyKey: idempotencyKey(),
    });
    expect(response.status).toBe(201);
    const resolvedAt = new Date(FROZEN_NOW.getTime() - 30 * 3600_000);
    await rawDb.lostPersonAlert.update({
      where: { id: response.body.alert.id },
      data: {
        raisedAt: new Date(resolvedAt.getTime() - 600_000),
        resolvedAt,
        status: 'RESOLVED_FOUND',
      },
    });
    await phase('LIVE');
    expect(await purgeResolvedAlerts(FROZEN_NOW)).toBe(1);
    expect((await rawDb.lostPersonSummary.findFirstOrThrow()).rehearsal).toBe(true);
  });

  it('keeps practice attendance and codes from creating live presence', async () => {
    const membership = await membershipOf(admin.id);
    await rawDb.setting.create({
      data: {
        scope: 'EVENT',
        scopeId: eventId,
        eventId,
        key: 'attendance.rootMembershipId',
        value: membership.id,
        version: 1,
      },
    });
    expect((await post('/attendance/start')).status).toBe(200);
    const challenge = await post('/attendance/challenge');
    expect(challenge.status).toBe(200);
    expect((await rawDb.attendance.findFirstOrThrow()).rehearsal).toBe(true);
    expect((await rawDb.attendanceChallenge.findFirstOrThrow()).rehearsal).toBe(true);
    await phase('LIVE');
    const liveStatus = await get('/attendance');
    expect(liveStatus.status).toBe(200);
    expect(liveStatus.body.attendance).toBeNull();
    const refused = await post('/attendance/submit', { method: 'PIN', pin: challenge.body.pin });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('ATTENDANCE_CODE_INVALID');
    expect((await post('/attendance/start')).status).toBe(200);
    expect(await rawDb.attendance.count({ where: { eventId, eventDayId: dayId } })).toBe(2);
  });

  it('keeps the event phase stable while a capture transaction holds its provenance', async () => {
    await prisma.$transaction(async (tx) => {
      expect(await captureProvenance(tx, { eventId })).toEqual({ rehearsal: true });
      await expect(
        rawDb.$transaction(async (other) => {
          await other.$executeRawUnsafe("SET LOCAL lock_timeout = '100ms'");
          await other.event.update({ where: { id: eventId }, data: { status: 'LIVE' } });
        }),
      ).rejects.toThrow(/lock timeout/);
    });
    await phase('LIVE');
  });
});
