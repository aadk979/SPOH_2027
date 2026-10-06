import { beforeEach, expect, it } from 'vitest';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  localReadinessFixture,
  readLocalReadiness,
  readinessEffectState,
  type LocalReadinessFixture,
} from '../helpers/localReadiness.js';
import { LOCAL_READY_CHECKS, MISSING_READY_CHECKS } from '../helpers/localReadinessChecks.js';
import { lifecycleNow } from '../helpers/scheduledLifecycle.js';

let f: LocalReadinessFixture;
beforeEach(async () => {
  await resetDatabase();
  f = await localReadinessFixture();
  await rawDb.organisationMembership.create({
    data: { organisationId: f.organisationId, personId: f.creator.id, role: 'PLATFORM_ADMIN' },
  });
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'READY' } });
});

it.each([null, ...MISSING_READY_CHECKS])(
  'records only owned worker failure while unavailable %s prevents first LIVE',
  async (code) => {
    const row = await f.create({
      to: 'LIVE',
      ...(code
        ? { goLiveOverrides: [{ code, reason: 'Owner reviewed this unavailable requirement' }] }
        : {}),
    });
    const readiness = await readLocalReadiness(f);
    expect(
      readiness.items.filter((item) => item.state === 'passed').map((item) => item.code),
    ).toEqual(LOCAL_READY_CHECKS);
    expect(
      readiness.items.filter((item) => item.state === 'unavailable').map((item) => item.code),
    ).toEqual(MISSING_READY_CHECKS);
    const before = await readinessEffectState(f);
    expect(await f.run()).toBe('FAILED');
    expect(await f.action(row.id)).toMatchObject({
      id: row.id,
      payload: row.payload,
      status: 'FAILED',
      lastError: 'GUARD_FAILED',
      attempts: 1,
      completedAt: lifecycleNow,
      lockedBy: null,
      lockedUntil: null,
    });
    expect(await readinessEffectState(f)).toEqual({ ...before, audit: before.audit + 1 });
    const receipts = await f.receipts(row.id);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      action: 'schedule.execute',
      entityId: row.id,
      eventId: f.eventId,
      actorId: f.creator.id,
      membershipId: f.membershipId,
      source: 'SCHEDULE',
      outcome: 'FAILURE',
      after: { type: 'event.transition', status: 'FAILED', attempts: 1, error: 'GUARD_FAILED' },
    });
    expect(
      await rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'event.transition' } }),
    ).toBe(0);
    expect(await rawDb.scheduledAction.count({ where: { eventId: f.eventId } })).toBe(1);
    expect(await f.claims()).toEqual([]);
  },
);
