import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it } from 'vitest';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { testEvent } from '../helpers/fixtures.js';
import {
  createReadinessCard,
  localReadinessFixture,
  readLocalReadiness,
  readLocalSnapshot,
  type LocalReadinessFixture,
} from '../helpers/localReadiness.js';

let f: LocalReadinessFixture;
beforeEach(async () => {
  await resetDatabase();
  f = await localReadinessFixture();
});
const item = async (code: string) =>
  (await readLocalReadiness(f)).items.find((row) => row.code === code);

it('counts only unissued, labeled live cards of this event, independent of preparation phase', async () => {
  await rawDb.missionCard.delete({ where: { id: f.card.id } });
  await createReadinessCard(f.eventId, { rehearsal: true, batchLabel: 'Practice' });
  await createReadinessCard(f.eventId, { batchLabel: null });
  await createReadinessCard(f.eventId, { batchLabel: '   ' });
  for (const status of ['ISSUED', 'COMPLETED', 'VOIDED', 'LOST'] as const) {
    await createReadinessCard(f.eventId, { status, batchLabel: 'Spent live batch' });
  }
  await createReadinessCard((await testEvent()).eventId, { batchLabel: 'Accepted live batch' });
  expect(await item('card-batch')).toMatchObject({
    state: 'failed',
    reasons: ['live-card-batch-missing'],
  });
  await createReadinessCard(f.eventId, { batchLabel: 'Accepted live batch' });
  expect(await item('card-batch')).toMatchObject({ state: 'passed' });
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'REHEARSAL' } });
  expect(await item('card-batch')).toMatchObject({ state: 'passed' });
});

it('aggregates live adjustments and nonvoided redemptions separately without multiplying rows', async () => {
  for (const delta of [3, -2])
    await rawDb.giftStockAdjustment.create({
      data: {
        eventId: f.eventId,
        giftTypeId: f.gift.id,
        delta,
        reason: 'Stock check',
        createdById: f.creator.id,
        createdByMembershipId: f.membershipId,
      },
    });
  await rawDb.giftStockAdjustment.create({
    data: {
      eventId: f.eventId,
      giftTypeId: f.gift.id,
      delta: 100,
      rehearsal: true,
      reason: 'Practice check',
      createdById: f.creator.id,
      createdByMembershipId: f.membershipId,
    },
  });
  for (const [rehearsal, voided] of [
    [false, false],
    [false, false],
    [false, true],
    [true, false],
  ] as const) {
    await rawDb.giftRedemption.create({
      data: {
        eventId: f.eventId,
        giftTypeId: f.gift.id,
        stationId: f.stationId,
        rehearsal,
        voided,
        recordedById: f.creator.id,
        recordedByMembershipId: f.membershipId,
        idempotencyKey: randomUUID(),
      },
    });
  }
  expect(await readLocalSnapshot(f)).toMatchObject({
    giftStock: {
      gifts: [
        {
          id: f.gift.id,
          initialStock: 10,
          adjustment: 1,
          redeemed: 2,
          rehearsal: false,
        },
      ],
    },
  });
  expect(await item('gift-stock')).toMatchObject({ state: 'passed' });
  await rawDb.giftType.update({ where: { id: f.gift.id }, data: { initialStock: 1 } });
  expect(await item('gift-stock')).toMatchObject({
    state: 'failed',
    reasons: ['live-gift-stock-empty'],
  });
});

it('cannot substitute practice or foreign stock and requires every active gift to have live stock', async () => {
  await rawDb.giftType.update({ where: { id: f.gift.id }, data: { initialStock: 0 } });
  await rawDb.giftType.create({
    data: { eventId: (await testEvent()).eventId, name: 'Gift', initialStock: 100 },
  });
  expect(await item('gift-stock')).toMatchObject({ state: 'failed' });
  await rawDb.giftType.update({ where: { id: f.gift.id }, data: { active: false } });
  expect(await item('gift-stock')).toMatchObject({
    state: 'failed',
    reasons: ['gift-types-empty'],
  });
  await rawDb.giftType.create({
    data: { eventId: f.eventId, name: 'Ready gift', initialStock: 1 },
  });
  expect(await item('gift-stock')).toMatchObject({ state: 'passed' });
  await rawDb.giftType.update({ where: { id: f.gift.id }, data: { active: true } });
  expect(await item('gift-stock')).toMatchObject({ state: 'failed' });
});

it.each(['demoted', 'deactivated', 'reset', 'malformed-root', 'malformed-networks'])(
  'evaluates current attendance %s without repairing stored configuration',
  async (change) => {
    if (change === 'demoted' || change === 'deactivated')
      await rawDb.eventMembership.update({
        where: { id: f.rootMember.id },
        data: change === 'demoted' ? { role: 'VOLUNTEER' } : { status: 'DEACTIVATED' },
      });
    if (change === 'reset') await rawDb.setting.deleteMany({ where: { eventId: f.eventId } });
    if (change.startsWith('malformed'))
      await rawDb.setting.update({
        where: {
          scope_scopeId_key: {
            scope: 'EVENT',
            scopeId: f.eventId,
            key:
              change === 'malformed-root'
                ? 'attendance.rootMembershipId'
                : 'attendance.campusCidrs',
          },
        },
        data: { value: change === 'malformed-root' ? 3 : ['203.0.113.0/24', 'invalid'] },
      });
    const before = await rawDb.setting.findMany({ where: { eventId: f.eventId } });
    expect(await item('attendance')).toMatchObject({ state: 'failed' });
    expect(await rawDb.setting.findMany({ where: { eventId: f.eventId } })).toEqual(before);
  },
);
