import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { ScheduleTimelineResponse, type ScheduledActionStatus } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import { readTimeline } from '../../src/modules/schedule/application/readTimeline.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer } from '../helpers/fixtures.js';
import {
  lifecycleNow,
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';

const app = createApp();
let f: ScheduledLifecycleFixture;
const actor = () => ({
  scope: { eventId: f.eventId },
  volunteerId: f.creator.id,
  membershipId: f.membershipId,
  audit: SYSTEM_AUDIT_CONTEXT,
  clock: fixedClock(lifecycleNow),
});
const get = (query = '') =>
  request(app)
    .get(`/api/v1/events/${f.eventId}/schedules${query}`)
    .set('Authorization', bearer(f.creator));
const create = (
  input: {
    id?: string;
    type?: string;
    status?: ScheduledActionStatus;
    eventId?: string;
    lastError?: string;
    createdByPersonId?: string | null;
    recurrence?: number | null;
  } = {},
) =>
  rawDb.scheduledAction.create({
    data: {
      ...input,
      eventId: input.eventId ?? f.eventId,
      type: input.type ?? 'announcement.publish',
      payload: {
        text: 'Private unsent draft text',
        audience: { personIds: ['private-person'] },
        token: 'private runtime payload',
      },
      createdByPersonId:
        input.createdByPersonId === undefined ? f.creator.id : input.createdByPersonId,
      scheduledFor: lifecycleNow,
      runAt: new Date(lifecycleNow.getTime() + 30_000),
      createdAt: lifecycleNow,
      lockedBy: input.status === 'RUNNING' ? 'private lease token' : null,
      lockedUntil: input.status === 'RUNNING' ? lifecycleNow : null,
      completedAt:
        input.status && ['SUCCEEDED', 'CANCELLED', 'FAILED', 'DEAD'].includes(input.status)
          ? lifecycleNow
          : null,
    },
  });

beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
});

it('lists strict no-store metadata without private payloads, creator IDs, lease data or any effects', async () => {
  await create();
  const before = await rawDb.scheduledAction.findMany();
  const response = await get();
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(ScheduleTimelineResponse.parse(response.body)).toMatchObject({
    eventId: f.eventId,
    data: [
      {
        kind: 'ANNOUNCEMENT',
        createdByYou: true,
        recurring: false,
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5,
      },
    ],
    meta: { count: 1, nextCursor: null },
  });
  for (const privateValue of [
    'Private unsent',
    'private-person',
    'private runtime',
    'private lease',
    f.creator.id,
    'payload',
    'lockedBy',
    'createdByPersonId',
  ])
    expect(response.text).not.toContain(privateValue);
  expect(await rawDb.scheduledAction.findMany()).toEqual(before);
  expect(await rawDb.auditLog.count()).toBe(0);
  expect(await rawDb.idempotencyRecord.count()).toBe(0);
});

it('returns an empty bounded collection', async () => {
  expect((await get()).body).toMatchObject({ data: [], meta: { count: 0, nextCursor: null } });
});

it.each(['PENDING', 'RUNNING', 'SUCCEEDED', 'CANCELLED', 'FAILED', 'DEAD'] as const)(
  'filters %s independently',
  async (status) => {
    await create({ status });
    await create({ status: status === 'PENDING' ? 'SUCCEEDED' : 'PENDING' });
    const response = await get(`?status=${status}`);
    expect(response.status).toBe(200);
    expect(response.body.data.map((row: { status: string }) => row.status)).toEqual([status]);
  },
);

it('paginates tied creation times without duplication and accepts a cursor whose status changed', async () => {
  for (const id of ['timeline-a', 'timeline-b', 'timeline-c']) await create({ id });
  const first = await get('?limit=2&status=PENDING');
  expect(first.body.data.map((row: { id: string }) => row.id)).toEqual([
    'timeline-c',
    'timeline-b',
  ]);
  expect(first.body.meta.nextCursor).toBe('timeline-b');
  await rawDb.scheduledAction.update({
    where: { id: 'timeline-b' },
    data: { status: 'SUCCEEDED', completedAt: lifecycleNow },
  });
  const second = await get('?limit=2&status=PENDING&cursor=timeline-b');
  expect(second.status).toBe(200);
  expect(second.body.data.map((row: { id: string }) => row.id)).toEqual(['timeline-a']);
  expect(second.body.meta.nextCursor).toBeNull();
});

it('hides foreign/platform actions and rejects foreign and nonexistent cursors equally', async () => {
  const foreign = await createEvent({
    organisationId: (await f.state()).organisationId,
    slug: 'foreign-timeline',
    name: 'Foreign timeline',
    timezone: 'Asia/Singapore',
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
  const row = await create({ eventId: foreign.id });
  await rawDb.scheduledAction.create({
    data: { type: 'session.prune', payload: {}, runAt: lifecycleNow },
  });
  expect((await get()).body.data).toEqual([]);
  expect((await get(`?cursor=${row.id}`)).status).toBe(404);
  expect((await get('?cursor=missing')).status).toBe(404);
  expect(
    (
      await request(app)
        .get(`/api/v1/events/${foreign.id}/schedules`)
        .set('Authorization', bearer(f.creator))
    ).status,
  ).toBe(404);
});

it('sanitizes unknown handler names and errors and falls back for historical missing scheduledFor', async () => {
  const row = await create({
    type: 'toString',
    lastError: 'private SQL/provider response',
    createdByPersonId: null,
    recurrence: 3600,
  });
  await rawDb.scheduledAction.update({ where: { id: row.id }, data: { scheduledFor: null } });
  const response = await get();
  expect(response.status).toBe(200);
  expect(response.body.data[0]).toMatchObject({
    kind: 'OTHER',
    lastError: 'EXECUTION_FAILED',
    createdByYou: false,
    recurring: true,
    scheduledFor: row.runAt.toISOString(),
  });
  expect(response.text).not.toContain('private SQL');
  expect(response.text).not.toContain('toString');
});

it.each([
  'INVALID_PAYLOAD',
  'AUTHORITY_CHANGED',
  'GUARD_FAILED',
  'TOO_LATE',
  'TARGET_MISSING',
  'SYSTEM_ONLY',
  'HANDLER_UNAVAILABLE',
  'EXECUTION_FAILED',
  'ATTEMPTS_EXHAUSTED',
])('returns the bounded %s failure code', async (lastError) => {
  await create({ status: 'FAILED', lastError });
  expect((await get()).body.data[0].lastError).toBe(lastError);
});

it('rejects anonymous and non-manager reads and malformed query keys before listing', async () => {
  const volunteer = await createVolunteer({
    email: 'timeline-reader@test.invalid',
    role: 'VOLUNTEER',
  });
  await rawDb.eventMembership.create({
    data: { eventId: f.eventId, personId: volunteer.id, role: 'VOLUNTEER', status: 'ACTIVE' },
  });
  expect((await request(app).get(`/api/v1/events/${f.eventId}/schedules`)).status).toBe(401);
  expect(
    (
      await request(app)
        .get(`/api/v1/events/${f.eventId}/schedules`)
        .set('Authorization', bearer(volunteer))
    ).status,
  ).toBe(403);
  for (const query of ['?limit=201', '?status=invalid', '?eventId=foreign', '?payload=private'])
    expect((await get(query)).status).toBe(400);
});

it('checks current membership rather than trusting a previously authorised request context', async () => {
  await rawDb.eventMembership.update({
    where: { id: f.membershipId },
    data: { role: 'VOLUNTEER' },
  });
  await expect(readTimeline({ limit: 50 }, actor())).rejects.toMatchObject({ statusCode: 403 });
});

it.each(['rows', 'authority'])(
  'observes committed %s and the post-wait clock after the Event lock',
  async (change) => {
    let now = lifecycleNow;
    let reading: ReturnType<typeof readTimeline> | undefined;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      reading = readTimeline({ limit: 50 }, { ...actor(), clock: { now: () => now } });
      void reading.catch(() => undefined);
      await expect
        .poll(async () => {
          const waiting = await rawDb.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR SHARE%'`;
          return Number(waiting[0]!.count);
        })
        .toBeGreaterThan(0);
      now = new Date(lifecycleNow.getTime() + 60_000);
      if (change === 'authority')
        await tx.eventMembership.update({
          where: { id: f.membershipId },
          data: { role: 'VOLUNTEER' },
        });
      else
        await tx.scheduledAction.create({
          data: { eventId: f.eventId, type: 'event.transition', payload: {}, runAt: lifecycleNow },
        });
    });
    if (change === 'authority') await expect(reading).rejects.toMatchObject({ statusCode: 403 });
    else {
      const result = await reading;
      expect(result!.data).toHaveLength(1);
      expect(result!.evaluatedAt).toBe(now.toISOString());
    }
  },
);
