import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { LifecycleReadinessResponse } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { readLifecycleReadiness } from '../../src/modules/event/application/readLifecycleReadiness.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, idempotencyKey, testEvent } from '../helpers/fixtures.js';
import {
  lifecycleAt,
  lifecycleNow,
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';

const app = createApp();
let f: ScheduledLifecycleFixture;
const get = (eventId = f.eventId) =>
  request(app)
    .get(`/api/v1/events/${eventId}/lifecycle/readiness`)
    .set('Authorization', bearer(f.creator));
const actor = () => ({
  scope: { eventId: f.eventId },
  volunteerId: f.creator.id,
  membershipId: f.membershipId,
  audit: SYSTEM_AUDIT_CONTEXT,
});
const read = () => readLifecycleReadiness({ ...actor(), clock: fixedClock(lifecycleNow) });
const post = (to: string, expectedVersion: number) =>
  request(app)
    .post(`/api/v1/events/${f.eventId}/lifecycle`)
    .set('Authorization', bearer(f.creator))
    .send({ to, expectedVersion, idempotencyKey: idempotencyKey() });

beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
});

it('returns a strict no-store advisory with no write, history, reservation or scheduling effect', async () => {
  const before = await f.state();
  const result = await get();
  expect(result.status).toBe(200);
  expect(result.headers['cache-control']).toBe('no-store');
  expect(LifecycleReadinessResponse.parse(result.body)).toMatchObject({
    lifecycle: { eventId: f.eventId, status: 'DRAFT', version: 0 },
    evaluatedAt: lifecycleNow.toISOString(),
    reopenUntil: null,
    transitions: [{ to: 'READY', allowed: true, requiresReason: false, blockers: [] }],
  });
  expect(await f.state()).toEqual(before);
  for (const count of [
    await rawDb.auditLog.count(),
    await rawDb.scheduledAction.count(),
    await rawDb.idempotencyRecord.count(),
  ])
    expect(count).toBe(0);
});

it.each(['timezone', 'event-days', 'shift-templates', 'station-types', 'categories'])(
  'shows the same %s blocker as the mutation',
  async (missing) => {
    if (missing === 'timezone')
      await rawDb.event.update({ where: { id: f.eventId }, data: { timezone: 'Invalid/Zone' } });
    if (missing === 'event-days')
      await rawDb.eventDay.deleteMany({ where: { eventId: f.eventId } });
    if (missing === 'shift-templates')
      await rawDb.shiftTemplate.updateMany({
        where: { eventId: f.eventId },
        data: { active: false },
      });
    if (missing === 'station-types')
      await rawDb.stationType.updateMany({
        where: { eventId: f.eventId },
        data: { active: false },
      });
    if (missing === 'categories')
      await rawDb.captureCategory.updateMany({
        where: { eventId: f.eventId },
        data: { active: false },
      });
    const readiness = await get();
    expect(readiness.body.transitions[0]).toMatchObject({ allowed: false, blockers: [missing] });
    const refused = await post('READY', 0);
    expect(refused.status).toBe(409);
    expect(refused.body.error.details.blockers).toEqual(readiness.body.transitions[0].blockers);
  },
);

it('never offers first go-live when server checklist evidence is unavailable', async () => {
  expect((await post('READY', 0)).status).toBe(200);
  const readiness = await get();
  expect(readiness.body.transitions).toEqual([
    { to: 'DRAFT', allowed: true, requiresReason: false, blockers: [] },
    { to: 'REHEARSAL', allowed: true, requiresReason: false, blockers: [] },
    {
      to: 'LIVE',
      allowed: false,
      requiresReason: false,
      blockers: [
        'go-live:shift-coverage',
        'go-live:card-batch',
        'go-live:gift-stock',
        'go-live:content:missing',
        'go-live:attendance',
        'go-live:role-permissions:missing',
        'go-live:notifications:missing',
        'go-live:staging-smoke:missing',
        'go-live:backups:missing',
        'go-live:alarms:missing',
      ],
    },
  ]);
});

it('shows sticky live history and practice/close edges without fabricating unavailable checks', async () => {
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'LIVE' } });
  expect((await read()).transitions).toEqual([
    { to: 'CLOSED', allowed: true, requiresReason: false, blockers: [] },
  ]);
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'READY' } });
  expect((await read()).transitions[0]).toMatchObject({
    allowed: false,
    blockers: ['already-live'],
  });
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'REHEARSAL' } });
  expect((await read()).transitions).toEqual([
    { to: 'READY', allowed: true, requiresReason: false, blockers: [] },
  ]);
});

it('keeps public archive unavailable even when close-out guards pass', async () => {
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'LIVE' } });
  expect((await post('CLOSED', (await f.state()).lifecycleVersion)).status).toBe(200);
  const readiness = await readLifecycleReadiness({
    ...actor(),
    clock: fixedClock(lifecycleAt(25 * 3600_000)),
  });
  expect(readiness.transitions.find((item) => item.to === 'ARCHIVED')).toEqual({
    to: 'ARCHIVED',
    allowed: false,
    requiresReason: false,
    blockers: ['archive-unavailable'],
  });
});

it.each([0, 48 * 3600_000, 48 * 3600_000 + 1, -1])(
  'checks current platform authority and exact elapsed reopening window at %s ms',
  async (offset) => {
    await rawDb.event.update({
      where: { id: f.eventId },
      data: { status: 'CLOSED', closedAt: lifecycleNow },
    });
    const beforeRole = await read();
    expect(beforeRole.transitions[0]).toMatchObject({
      to: 'LIVE',
      allowed: false,
      requiresReason: true,
      blockers: ['platform-admin-required'],
    });
    await rawDb.organisationMembership.create({
      data: { organisationId: f.organisationId, personId: f.creator.id, role: 'PLATFORM_ADMIN' },
    });
    const readiness = await readLifecycleReadiness({
      ...actor(),
      clock: fixedClock(lifecycleAt(offset)),
    });
    expect(readiness.reopenUntil).toBe(lifecycleAt(48 * 3600_000).toISOString());
    expect(readiness.transitions[0]).toEqual({
      to: 'LIVE',
      allowed: offset >= 0 && offset <= 48 * 3600_000,
      requiresReason: true,
      blockers: offset >= 0 && offset <= 48 * 3600_000 ? [] : ['reopen-window-expired'],
    });
  },
);

it('refuses anonymous, insufficient-role and foreign-event reads', async () => {
  expect((await request(app).get(`/api/v1/events/${f.eventId}/lifecycle/readiness`)).status).toBe(
    401,
  );
  const volunteer = await createVolunteer({ email: 'readiness@fixture.test', role: 'VOLUNTEER' });
  expect(
    (
      await request(app)
        .get(`/api/v1/events/${(await testEvent()).eventId}/lifecycle/readiness`)
        .set('Authorization', bearer(volunteer))
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .get(`/api/v1/events/${f.eventId}/lifecycle/readiness`)
        .set('Authorization', bearer(volunteer))
    ).status,
  ).toBe(404);
});

async function waitForReadinessLock() {
  await expect
    .poll(async () => {
      const rows = await rawDb.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR SHARE%'`;
      return Number(rows[0]!.count);
    })
    .toBeGreaterThan(0);
}

it.each(['permission', 'structure', 'lifecycle'])(
  'reads the committed %s after waiting for Event, without stale transaction snapshots',
  async (change) => {
    let running: ReturnType<typeof read> | undefined;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      running = read();
      const handled = running.catch(() => undefined);
      void handled;
      await waitForReadinessLock();
      if (change === 'permission')
        await tx.eventMembership.update({
          where: { id: f.membershipId },
          data: { role: 'VOLUNTEER' },
        });
      if (change === 'structure') await tx.eventDay.deleteMany({ where: { eventId: f.eventId } });
      if (change === 'lifecycle')
        await tx.event.update({ where: { id: f.eventId }, data: { status: 'READY' } });
    });
    if (change === 'permission') await expect(running).rejects.toMatchObject({ statusCode: 403 });
    else if (change === 'structure')
      expect((await running)!.transitions[0]?.blockers).toEqual(['event-days']);
    else expect((await running)!.lifecycle).toMatchObject({ status: 'READY', version: 1 });
  },
);

it('samples its injected clock after waiting and rechecks organisation authority then', async () => {
  await rawDb.event.update({
    where: { id: f.eventId },
    data: { status: 'CLOSED', closedAt: lifecycleNow },
  });
  const member = await rawDb.organisationMembership.create({
    data: { organisationId: f.organisationId, personId: f.creator.id, role: 'PLATFORM_ADMIN' },
  });
  let now = lifecycleAt(48 * 3600_000);
  let running: ReturnType<typeof read> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
    running = readLifecycleReadiness({ ...actor(), clock: { now: () => now } });
    await waitForReadinessLock();
    now = lifecycleAt(48 * 3600_000 + 1);
    await tx.organisationMembership.update({ where: { id: member.id }, data: { role: 'MEMBER' } });
  });
  expect((await running)!.transitions[0]?.blockers).toEqual([
    'reopen-window-expired',
    'platform-admin-required',
  ]);
});
