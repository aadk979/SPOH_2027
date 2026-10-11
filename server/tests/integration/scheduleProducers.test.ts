import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ScheduleMutationResponse } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer } from '../helpers/fixtures.js';
import {
  lifecycleAt,
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';

/**
 * P10.8: the producers for timed lifecycle transitions and daily report snapshots, and the
 * shared cancel. Execution itself is the handlers' (scheduledLifecycle*, scheduledReport*).
 */
const app = createApp();
let f: ScheduledLifecycleFixture;
const root = () => `/api/v1/events/${f.eventId}/schedules`;
const post = (path: string, body: object) =>
  request(app).post(`${root()}${path}`).set('Authorization', bearer(f.creator)).send(body);
const lifecycle = async (patch = {}) =>
  post('/lifecycle', {
    to: 'READY',
    expectedVersion: (await f.state()).lifecycleVersion,
    runAt: lifecycleAt(3600_000).toISOString(),
    idempotencyKey: randomUUID(),
    ...patch,
  });
const day = () => rawDb.eventDay.findFirstOrThrow({ where: { eventId: f.eventId } });
const report = async (patch = {}) =>
  post('/reports', {
    eventDayId: (await day()).id,
    runAt: lifecycleAt(3600_000).toISOString(),
    idempotencyKey: randomUUID(),
    ...patch,
  });
const cancel = (id: string, expectedVersion = 1) =>
  post(`/${id}/cancel`, { expectedVersion, idempotencyKey: randomUUID() });

beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
});

describe('timed lifecycle transitions', () => {
  it('records a pending transition reviewed against the current version', async () => {
    const version = (await f.state()).lifecycleVersion;
    const response = await lifecycle({ reason: 'Ready once the venue walk is done' });
    expect(response.status).toBe(201);
    const { schedule } = ScheduleMutationResponse.parse(response.body);
    expect(schedule).toMatchObject({ kind: 'LIFECYCLE', status: 'PENDING', createdByYou: true });
    const row = await f.action(schedule.id);
    expect(row).toMatchObject({
      type: 'event.transition',
      createdByPersonId: f.creator.id,
      payload: { to: 'READY', expectedVersion: version, reason: 'Ready once the venue walk is done' },
    });
    expect(row.runAt).toEqual(lifecycleAt(3600_000));
    const audit = await rawDb.auditLog.findFirst({
      where: { action: 'schedule.create', entityId: schedule.id },
    });
    expect(audit).toMatchObject({ actorId: f.creator.id, eventId: f.eventId });
    expect((await f.state()).status).toBe('DRAFT');
  });

  it('refuses a version that is no longer current', async () => {
    const response = await lifecycle({ expectedVersion: (await f.state()).lifecycleVersion + 1 });
    expect(response.status).toBe(409);
  });

  it('refuses an edge the state machine does not have', async () => {
    expect((await lifecycle({ to: 'LIVE' })).status).toBe(409);
    expect((await lifecycle({ to: 'ARCHIVED' })).status).toBe(409);
  });

  it('refuses a time that has passed or is beyond a year', async () => {
    expect((await lifecycle({ runAt: lifecycleAt(-1).toISOString() })).status).toBe(400);
    const far = lifecycleAt(367 * 24 * 3600_000).toISOString();
    expect((await lifecycle({ runAt: far })).status).toBe(400);
  });

  it('refuses someone who may not manage schedules', async () => {
    await rawDb.eventMembership.update({ where: { id: f.membershipId }, data: { role: 'VOLUNTEER' } });
    expect((await lifecycle()).status).toBe(403);
  });

  it('runs through the same transition core when it is due', async () => {
    const { schedule } = ScheduleMutationResponse.parse((await lifecycle()).body);
    expect((await f.claims(lifecycleAt(3600_000))).map((claim) => claim.id)).toEqual([schedule.id]);
  });
});

describe('timed report snapshots', () => {
  it('records a pending daily snapshot for a day of this event', async () => {
    const response = await report({ includeRehearsal: true });
    expect(response.status).toBe(201);
    const { schedule } = ScheduleMutationResponse.parse(response.body);
    expect(schedule).toMatchObject({ kind: 'REPORT', status: 'PENDING' });
    expect((await f.action(schedule.id)).payload).toEqual({
      kind: 'daily',
      eventDayId: (await day()).id,
      includeRehearsal: true,
    });
  });

  it('refuses a day that is not this event’s', async () => {
    expect((await report({ eventDayId: 'cmissingday0000000000000' })).status).toBe(404);
  });
});

describe('cancelling', () => {
  it('cancels a pending schedule once, at the version the canceller saw', async () => {
    const { schedule } = ScheduleMutationResponse.parse((await report()).body);
    const response = await cancel(schedule.id);
    expect(response.status).toBe(200);
    expect(ScheduleMutationResponse.parse(response.body).schedule).toMatchObject({
      status: 'CANCELLED',
      version: 2,
    });
    expect((await cancel(schedule.id)).status).toBe(409);
    expect((await cancel(schedule.id, 2)).status).toBe(409);
    const audit = await rawDb.auditLog.findFirst({
      where: { action: 'schedule.cancel', entityId: schedule.id },
    });
    expect(audit?.after).toEqual({ status: 'CANCELLED', version: 2 });
  });

  it('refuses a stale version without changing the schedule', async () => {
    const { schedule } = ScheduleMutationResponse.parse((await lifecycle()).body);
    expect((await cancel(schedule.id, 7)).status).toBe(409);
    expect((await f.action(schedule.id)).status).toBe('PENDING');
  });

  it('leaves kinds with their own editors to those editors', async () => {
    const system = await rawDb.scheduledAction.create({
      data: { eventId: f.eventId, type: 'retention.media', payload: {}, runAt: lifecycleAt(1) },
    });
    expect((await cancel(system.id)).status).toBe(404);
    expect((await f.action(system.id)).status).toBe('PENDING');
  });
});
