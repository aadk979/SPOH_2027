import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as cloudReader from '../../src/platform/aws/readiness/index.js';
import { readLifecycleReadiness } from '../../src/modules/event/application/readLifecycleReadiness.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { localReadinessFixture, readinessEffectState, type LocalReadinessFixture } from '../helpers/localReadiness.js';
import { lifecycleAt, lifecycleNow } from '../helpers/scheduledLifecycle.js';
import type { CloudReadinessSnapshot } from '../../src/platform/aws/readiness/ports.js';
import request from 'supertest';
import { createApp } from '../../src/app/createApp.js';
import { bearer, idempotencyKey } from '../helpers/fixtures.js';

const providers = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../src/platform/aws/readiness/index.js', () => ({ readCloudReadiness: providers.read }));
const app = createApp();

let f: LocalReadinessFixture;
const now = lifecycleNow.getTime();
const cloud = (): CloudReadinessSnapshot => ({
  selection: { deploymentId: 'accepted-release', databaseId: 'selected-database', requiredAlarmIds: ['selected-alarm'],
    freshness: { smokeMaxAgeMs: 300_000, backupMaxAgeMs: 300_000, alarmsMaxAgeMs: 300_000 } },
  smoke: { deploymentId: 'accepted-release', observedAtMs: now - 1, passed: true },
  backups: { databaseId: 'selected-database', observedAtMs: now - 1, restorableThroughMs: now - 10_000 },
  alarms: { deploymentId: 'accepted-release', observedAtMs: now - 1, alarms: [{ id: 'selected-alarm', state: 'OK' }] },
});
const read = (clock = { now: () => lifecycleNow }) => readLifecycleReadiness({
  scope: { eventId: f.eventId }, volunteerId: f.creator.id, membershipId: f.membershipId,
  audit: SYSTEM_AUDIT_CONTEXT, clock,
});
async function waitForLock(table: 'Event' | 'EventMembership') {
  const pattern = `%FROM "${table}"%FOR SHARE%`;
  await expect.poll(async () => {
    const rows = await rawDb.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE ${pattern}`;
    return Number(rows[0]!.count);
  }).toBeGreaterThan(0);
}
beforeEach(async () => {
  await resetDatabase(); f = await localReadinessFixture();
  providers.read.mockReset().mockResolvedValue(cloud());
});
afterEach(() => vi.clearAllMocks());

it('maps real server-selected cloud evidence on a read without any business, audit or receipt effect', async () => {
  const before = await readinessEffectState(f);
  const result = await read();
  expect(result.goLiveReadiness.filter(row => ['staging-smoke', 'backups', 'alarms'].includes(row.code))
    .map(row => [row.code, row.state])).toEqual([
      ['staging-smoke', 'passed'], ['backups', 'passed'], ['alarms', 'passed'],
    ]);
  expect(await readinessEffectState(f)).toEqual(before);
});

it('holds no Event lock while the independent provider observation is pending', async () => {
  let release!: (value: CloudReadinessSnapshot) => void;
  const pending = new Promise<CloudReadinessSnapshot>(resolve => { release = resolve; });
  vi.mocked(cloudReader.readCloudReadiness).mockReturnValueOnce(pending);
  const running = read(); void running.catch(() => undefined);
  await expect.poll(() => vi.mocked(cloudReader.readCloudReadiness).mock.calls.length).toBe(1);
  try {
    await rawDb.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE NOWAIT`;
    });
  } finally { release(cloud()); }
  expect((await running).evaluatedAt).toBe(lifecycleNow.toISOString());
});

it('refuses cloud observations that expire during the Event lock wait and observes committed local changes', async () => {
  let instant = lifecycleNow;
  let running: ReturnType<typeof read> | undefined;
  await rawDb.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
    running = read({ now: () => instant }); void running.catch(() => undefined);
    await waitForLock('Event');
    instant = lifecycleAt(300_001);
    await tx.captureCategory.update({ where: { id: f.categoryId }, data: { active: false } });
  });
  const result = (await running)!;
  expect(result.evaluatedAt).toBe(instant.toISOString());
  for (const code of ['staging-smoke', 'backups', 'alarms']) {
    expect(result.goLiveReadiness.find(row => row.code === code)).toMatchObject({
      state: 'unavailable', reasons: ['evidence-stale'],
    });
  }
  expect(result.goLiveReadiness.find(row => row.code === 'categories')).toMatchObject({ state: 'failed' });
});

it('rejects authority deactivated during the current-member lock wait despite earlier fresh cloud evidence', async () => {
  let running: ReturnType<typeof read> | undefined;
  await rawDb.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${f.membershipId} FOR UPDATE`;
    running = read(); void running.catch(() => undefined); await waitForLock('EventMembership');
    await tx.eventMembership.update({ where: { id: f.membershipId }, data: { status: 'DEACTIVATED' } });
  });
  await expect(running).rejects.toMatchObject({ statusCode: 403 });
  expect(await rawDb.auditLog.count()).toBe(0); expect(await rawDb.idempotencyRecord.count()).toBe(0);
});

it('manual first LIVE evaluates the current server observations, without a client evidence field', async () => {
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'READY' } });
  const result = await request(app).post(`/api/v1/events/${f.eventId}/lifecycle`)
    .set('Authorization', bearer(f.creator)).send({ to: 'LIVE',
      expectedVersion: (await f.state()).lifecycleVersion, idempotencyKey: idempotencyKey() });
  expect(result.status).toBe(200); expect((await f.state()).status).toBe('LIVE');
  expect(providers.read).toHaveBeenCalledTimes(1);
  expect(await rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'event.transition' } })).toBe(1);
});

it('a scheduled first LIVE uses the same prepared cloud observations and commits its fenced completion', async () => {
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'READY' } });
  const scheduled = await f.create({ to: 'LIVE' });
  expect(await f.run()).toBe('SUCCEEDED'); expect((await f.state()).status).toBe('LIVE');
  expect(await f.action(scheduled.id)).toMatchObject({ status: 'SUCCEEDED', completedAt: lifecycleNow });
  expect(providers.read).toHaveBeenCalledTimes(1);
  expect(await rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'event.transition' } })).toBe(1);
});

it('unavailable prepared facts cannot be reason-overridden by a platform admin on a scheduled transition', async () => {
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'READY' } });
  await rawDb.organisationMembership.create({ data: { organisationId: f.organisationId,
    personId: f.creator.id, role: 'PLATFORM_ADMIN' } });
  providers.read.mockResolvedValue({ selection: cloud().selection });
  const scheduled = await f.create({ to: 'LIVE', goLiveOverrides: ['staging-smoke', 'backups', 'alarms']
    .map(code => ({ code, reason: 'Reviewed synthetic refusal test' })) });
  const before = await f.state();
  expect(await f.run()).toBe('FAILED'); expect(await f.state()).toEqual(before);
  expect(await f.action(scheduled.id)).toMatchObject({ status: 'FAILED', lastError: 'GUARD_FAILED' });
  expect(await rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'event.transition' } })).toBe(0);
});

it('rejects client-submitted cloud evidence before a lifecycle mutation', async () => {
  const before = await f.state();
  const result = await request(app).post(`/api/v1/events/${f.eventId}/lifecycle`)
    .set('Authorization', bearer(f.creator)).send({ to: 'READY', expectedVersion: before.lifecycleVersion,
      idempotencyKey: idempotencyKey(), cloudReadiness: cloud() });
  expect(result.status).toBe(400); expect(await f.state()).toEqual(before);
  expect(providers.read).not.toHaveBeenCalled();
});
