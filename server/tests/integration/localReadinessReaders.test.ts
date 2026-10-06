import { beforeEach, expect, it } from 'vitest';
import { addShiftsForDay } from '../../src/modules/eventDays/index.js';
import { prisma } from '../../src/platform/db/client.js';
import { eventDayAnchor } from '../../src/platform/time/index.js';
import { goLiveCheckBlockers } from '../../src/modules/event/domain/goLiveChecks.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  foreignReadinessFixture,
  localReadinessFixture,
  readLocalReadiness,
  readLocalSnapshot,
  readinessEffectState,
  type LocalReadinessFixture,
} from '../helpers/localReadiness.js';

let f: LocalReadinessFixture;
beforeEach(async () => {
  await resetDatabase();
  f = await localReadinessFixture();
});
const item = async (code: string) =>
  (await readLocalReadiness(f)).items.find((row) => row.code === code);

it('reads five local domains without writing and leaves every missing domain nonwaivable', async () => {
  const before = await readinessEffectState(f);
  const result = await readLocalReadiness(f);
  expect(result.items.filter((row) => row.state === 'passed').map((row) => row.code)).toEqual([
    'shift-coverage',
    'categories',
    'card-batch',
    'gift-stock',
    'attendance',
  ]);
  expect(result.items.filter((row) => row.state === 'unavailable')).toHaveLength(6);
  for (const absent of result.items.filter((row) => row.state === 'unavailable')) {
    expect(
      goLiveCheckBlockers(result.checks, {
        platformAdmin: true,
        goLiveOverrides: [{ code: absent.code, reason: 'Reviewed readiness' }],
      }),
    ).toContain('go-live:' + absent.code + ':missing');
  }
  expect(await readinessEffectState(f)).toEqual(before);
  expect(JSON.stringify(result.items)).not.toContain(f.worker.id);
  expect(JSON.stringify(result.items)).not.toMatch(/203\.0\.113|Accepted live batch|initialStock/);
});

it('requires a materialized shift for every active template on every day', async () => {
  const day = await rawDb.eventDay.create({
    data: { eventId: f.eventId, date: eventDayAnchor('2027-01-08'), label: 'Second day' },
  });
  expect(await item('shift-coverage')).toMatchObject({
    state: 'failed',
    reasons: ['shifts-not-materialised'],
  });
  await addShiftsForDay(prisma, { eventId: f.eventId }, { id: day.id, date: '2027-01-08' });
  expect(await item('shift-coverage')).toMatchObject({
    state: 'failed',
    reasons: ['shift-station-unstaffed'],
  });
});

it.each(['null', 'deactivated', 'invited', 'ended', 'person-mismatch', 'day-mismatch'])(
  'does not credit an assignment with %s standing or identity',
  async (change) => {
    if (change === 'null')
      await rawDb.shiftAssignment.update({
        where: { id: f.assignment.id },
        data: { membershipId: null },
      });
    if (['deactivated', 'invited', 'ended'].includes(change))
      await rawDb.eventMembership.update({
        where: { id: f.workerMember.id },
        data: { status: change.toUpperCase() as 'DEACTIVATED' | 'INVITED' | 'ENDED' },
      });
    if (change === 'person-mismatch')
      await rawDb.shiftAssignment.update({
        where: { id: f.assignment.id },
        data: { membershipId: f.rootMember.id },
      });
    if (change === 'day-mismatch') {
      const day = await rawDb.eventDay.create({
        data: { eventId: f.eventId, date: eventDayAnchor('2027-01-08'), label: 'Second day' },
      });
      await addShiftsForDay(prisma, { eventId: f.eventId }, { id: day.id, date: '2027-01-08' });
      await rawDb.shiftAssignment.update({
        where: { id: f.assignment.id },
        data: { eventDayId: day.id },
      });
    }
    expect(await item('shift-coverage')).toMatchObject({
      state: 'failed',
      reasons: ['shift-station-unstaffed'],
    });
  },
);

it('excludes inactive station types while retaining all required active stations', async () => {
  const type = await rawDb.stationType.create({
    data: { eventId: f.eventId, code: 'HIDDEN', label: 'Hidden', active: false },
  });
  await rawDb.station.create({
    data: { eventId: f.eventId, typeId: type.id, code: 'HIDDEN', name: 'Hidden' },
  });
  expect(await item('shift-coverage')).toMatchObject({ state: 'passed' });
  await rawDb.stationType.update({ where: { id: type.id }, data: { active: true } });
  expect(await item('shift-coverage')).toMatchObject({
    state: 'failed',
    reasons: ['shift-station-unstaffed'],
  });
});

it('never borrows sufficient facts with colliding labels and dates from another organisation', async () => {
  const other = await foreignReadinessFixture(f);
  expect(other.organisationId).not.toBe(f.organisationId);
  await rawDb.setting.update({
    where: {
      scope_scopeId_key: {
        scope: 'EVENT',
        scopeId: f.eventId,
        key: 'attendance.rootMembershipId',
      },
    },
    data: { value: other.root.id },
  });
  await rawDb.shiftAssignment.delete({ where: { id: f.assignment.id } });
  await rawDb.captureCategory.updateMany({
    where: { eventId: f.eventId },
    data: { active: false },
  });
  await rawDb.missionCard.delete({ where: { id: f.card.id } });
  await rawDb.giftType.update({ where: { id: f.gift.id }, data: { initialStock: 0 } });
  const snapshot = await readLocalSnapshot(f);
  expect(JSON.stringify(snapshot)).not.toContain(other.eventId);
  for (const id of [
    other.day.id,
    other.shift.id,
    other.station.id,
    other.worker.id,
    other.gift.id,
  ]) {
    expect(JSON.stringify(snapshot)).not.toContain(id);
  }
  expect(snapshot).toMatchObject({
    attendance: { rootValue: other.root.id, root: null },
    cardBatch: { batches: [] },
    categories: { activeCategories: 0 },
  });
  expect(
    (await readLocalReadiness(f)).items
      .filter((row) => row.state === 'failed')
      .map((row) => row.code),
  ).toEqual(['shift-coverage', 'categories', 'card-batch', 'gift-stock', 'attendance']);
});
