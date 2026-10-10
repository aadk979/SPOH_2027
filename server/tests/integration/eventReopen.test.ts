import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import * as lifecycleRepo from '../../src/modules/event/data/lifecycleRepo.js';
import * as authorityRepo from '../../src/modules/event/data/lifecycleAuthorityRepo.js';
import * as snapshotRepo from '../../src/modules/report/data/snapshotRepo.js';
import * as reminderRepo from '../../src/modules/event/data/archiveReminderRepo.js';
import * as cacheBus from '../../src/platform/events/cacheBus.js';
import * as idempotency from '../../src/platform/idempotency/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createStation,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
let eventId: string;
let organisationId: string;
let admin: TestVolunteer;
let version: number;
let fixtureNumber = 0;
const state = () => rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
const post = (body: object, pathEvent = eventId) =>
  request(app)
    .post(`/api/v1/events/${pathEvent}/lifecycle`)
    .set('Authorization', bearer(admin))
    .send(body);
const reopenBody = () => ({
  to: 'LIVE',
  expectedVersion: version,
  reason: 'Correct a mistaken close during the drill',
  idempotencyKey: idempotencyKey(),
});
const snapshots = () => rawDb.reportSnapshot.findMany({ where: { eventId } });
const reminders = () => rawDb.scheduledAction.findMany({ where: { eventId } });

beforeEach(async () => {
  vi.setSystemTime(FROZEN_NOW);
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: `admin-${fixtureNumber++}@reopen.test`, role: 'ADMIN' });
  organisationId = (await state()).organisationId;
  await rawDb.organisationMembership.create({
    data: { organisationId, personId: admin.id, role: 'PLATFORM_ADMIN' },
  });
  expect(
    (
      await post({
        to: 'CLOSED',
        expectedVersion: (await state()).lifecycleVersion,
        idempotencyKey: idempotencyKey(),
      })
    ).status,
  ).toBe(200);
  version = (await state()).lifecycleVersion;
});

it('reopens once, preserves the frozen document and atomically supersedes and cancels', async () => {
  const beforeSnapshot = (await snapshots())[0]!;
  const beforeReminder = (await reminders())[0]!;
  const requestBody = reopenBody();
  const reopened = await post(requestBody);
  expect(reopened.status).toBe(200);
  expect((await post(requestBody)).body).toEqual(reopened.body);
  expect(await state()).toMatchObject({
    status: 'LIVE',
    closedAt: null,
    hasBeenLive: true,
    lifecycleVersion: version + 1,
  });
  expect((await snapshots())[0]).toEqual({ ...beforeSnapshot, supersededAt: FROZEN_NOW });
  expect((await reminders())[0]).toEqual({
    ...beforeReminder,
    status: 'CANCELLED',
    completedAt: FROZEN_NOW,
    version: beforeReminder.version + 1,
  });
  const audit = await rawDb.auditLog.findMany({ where: { eventId, action: 'event.transition' } });
  expect(audit).toHaveLength(2);
  expect(
    audit.find((row) => (row.after as { status: string }).status === 'LIVE')?.after,
  ).toMatchObject({
    action: 'Event.Reopen',
    reason: requestBody.reason,
    guardResults: { platformAdmin: true, closedAt: FROZEN_NOW.toISOString(), reopenHours: 48 },
    reopen: {
      supersededFinalSnapshotIds: [beforeSnapshot.id],
      cancelledArchiveReminderIds: [beforeReminder.id],
    },
  });
  const current = await request(app)
    .get(`/api/v1/events/${eventId}/reports/summary`)
    .set('Authorization', bearer(admin));
  expect(current.status).toBe(200);
  expect(current.body.snapshot).toBeUndefined();
  expect(current.body.event.status).toBe('LIVE');
});

it('reclosing freezes a new final report without reviving the old snapshot or reminder', async () => {
  const oldSnapshot = (await snapshots())[0]!;
  const oldReminder = (await reminders())[0]!;
  expect((await post(reopenBody())).status).toBe(200);
  const station = await createStation({ code: 'RECLOSE' });
  const category = await rawDb.captureCategory.findFirstOrThrow({
    where: { eventId, code: 'OTHER' },
  });
  await rawDb.registration.create({
    data: {
      eventId,
      stationId: station.id,
      categoryId: category.id,
      recordedById: admin.id,
      recordedAt: FROZEN_NOW,
      idempotencyKey: idempotencyKey(),
    },
  });
  expect(
    (await post({ to: 'CLOSED', expectedVersion: version + 1, idempotencyKey: idempotencyKey() }))
      .status,
  ).toBe(200);
  const read = await request(app)
    .get(`/api/v1/events/${eventId}/reports/summary`)
    .set('Authorization', bearer(admin));
  expect(read.body.snapshot.lifecycleVersion).toBe(version + 2);
  expect(read.body.snapshot.id).not.toBe(oldSnapshot.id);
  expect(read.body.registrations.total).toBe(1);
  const saved = await snapshots();
  expect(saved).toHaveLength(2);
  expect(saved.find((row) => row.id === oldSnapshot.id)).toEqual({
    ...oldSnapshot,
    supersededAt: FROZEN_NOW,
  });
  expect(saved.filter((row) => row.supersededAt === null)).toHaveLength(1);
  const queued = await reminders();
  expect(queued).toHaveLength(2);
  expect(queued.find((row) => row.id === oldReminder.id)?.status).toBe('CANCELLED');
  expect(queued.filter((row) => row.status === 'PENDING')).toHaveLength(1);
});

it.each([
  ['exactly 48 hours', 48 * 3600_000, 200],
  ['one millisecond too late', 48 * 3600_000 + 1, 409],
  ['before the recorded close', -1, 409],
] as const)('checks the injected clock at %s', async (_name, elapsed, status) => {
  vi.setSystemTime(new Date(FROZEN_NOW.getTime() + elapsed));
  const session = await request(app).post('/api/v1/auth/session').send({ email: admin.email });
  expect(session.status).toBe(201);
  admin = { ...admin, token: session.body.accessToken };
  const result = await post(reopenBody());
  expect(result.status).toBe(status);
  if (status === 409) {
    expect(result.body.error.details.blockers).toContain('reopen-window-expired');
    expect((await state()).status).toBe('CLOSED');
    expect((await snapshots())[0]?.supersededAt).toBeNull();
    expect((await reminders())[0]?.status).toBe('PENDING');
  }
});

it('requires a written reason and a trustworthy close time', async () => {
  const body = reopenBody();
  const { reason: _reason, ...withoutReason } = body;
  const missing = await post(withoutReason);
  expect(missing.status).toBe(409);
  expect(missing.body.error.details.blockers).toContain('reason-required');
  expect((await post({ ...reopenBody(), reason: '   ' })).status).toBe(400);
  await rawDb.event.update({ where: { id: eventId }, data: { closedAt: null } });
  const undated = await post(reopenBody());
  expect(undated.status).toBe(409);
  expect(undated.body.error.details.blockers).toContain('reopen-window-expired');
});

it.each(['MEMBER', 'absent', 'foreign organisation'])(
  'requires platform authority in this organisation, not %s',
  async (kind) => {
    await rawDb.organisationMembership.deleteMany({
      where: { organisationId, personId: admin.id },
    });
    if (kind === 'MEMBER')
      await rawDb.organisationMembership.create({ data: { organisationId, personId: admin.id } });
    if (kind === 'foreign organisation') {
      const other = await rawDb.organisation.upsert({
        where: { slug: 'foreign-reopen' },
        create: {
          slug: 'foreign-reopen',
          name: 'Other organisation',
          appName: 'Other operations',
          defaultTimezone: 'Europe/London',
        },
        update: {},
      });
      await rawDb.organisationMembership.create({
        data: { organisationId: other.id, personId: admin.id, role: 'PLATFORM_ADMIN' },
      });
    }
    const result = await post(reopenBody());
    expect(result.status).toBe(409);
    expect(result.body.error.details.blockers).toContain('platform-admin-required');
    expect((await snapshots())[0]?.supersededAt).toBeNull();
    expect((await reminders())[0]?.status).toBe('PENDING');
  },
);

it('refuses authority forged in the request and first go-live without server checks', async () => {
  expect((await post({ ...reopenBody(), platformAdmin: true })).status).toBe(400);
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'READY' } });
  const ready = await post({ ...reopenBody(), expectedVersion: version + 1 });
  expect(ready.status).toBe(409);
  expect(ready.body.error.details.blockers).toContain('go-live:content');
  expect(ready.body.error.details.blockers).toContain('go-live:staging-smoke:missing');
});

it.each([
  'organisation role',
  'organisation membership',
  'event standing',
  'ended membership',
  'person standing',
])(
  'rechecks current %s after middleware and before reopening',
  async (kind) => {
    const original = lifecycleRepo.lockLifecycleEvent;
    const spy = vi
      .spyOn(lifecycleRepo, 'lockLifecycleEvent')
      .mockImplementationOnce(async (...args) => {
        const event = await original(...args);
        if (kind === 'organisation role') {
          await rawDb.organisationMembership.updateMany({
            where: { organisationId, personId: admin.id },
            data: { role: 'MEMBER' },
          });
        } else if (kind === 'organisation membership') {
          await rawDb.organisationMembership.deleteMany({
            where: { organisationId, personId: admin.id },
          });
        } else if (kind === 'person standing') {
          await rawDb.person.update({
            where: { id: admin.id },
            data: { deactivatedAt: FROZEN_NOW },
          });
        } else {
          await rawDb.eventMembership.updateMany({
            where: { eventId, personId: admin.id },
            data: { status: kind === 'ended membership' ? 'ENDED' : 'DEACTIVATED' },
          });
        }
        return event;
      });
    try {
      const result = await post(reopenBody());
      expect(result.status).toBe(403);
      expect(result.body.error.code).toBe('FORBIDDEN');
    } finally {
      spy.mockRestore();
    }
    expect((await state()).status).toBe('CLOSED');
    expect((await snapshots())[0]?.supersededAt).toBeNull();
    expect((await reminders())[0]?.status).toBe('PENDING');
  },
);

it('retains locked reopen authority when the platform admin has a lower current event role', async () => {
  const original = lifecycleRepo.lockLifecycleEvent;
  const spy = vi
    .spyOn(lifecycleRepo, 'lockLifecycleEvent')
    .mockImplementationOnce(async (...args) => {
      const event = await original(...args);
      await rawDb.eventMembership.updateMany({
        where: { eventId, personId: admin.id },
        data: { role: 'VOLUNTEER' },
      });
      return event;
    });
  try {
    expect((await post(reopenBody())).status).toBe(200);
  } finally {
    spy.mockRestore();
  }
  expect(await state()).toMatchObject({ status: 'LIVE', lifecycleVersion: version + 1 });
  expect((await snapshots())[0]?.supersededAt).toEqual(FROZEN_NOW);
  expect((await reminders())[0]?.status).toBe('CANCELLED');
});

it('holds organisation authority stable until the transition transaction commits', async () => {
  const original = authorityRepo.currentOrganisationRole;
  let writer: Promise<unknown> | undefined;
  const spy = vi
    .spyOn(authorityRepo, 'currentOrganisationRole')
    .mockImplementationOnce(async (...args) => {
      const member = await original(...args);
      let writerPid = 0;
      let ready!: () => void;
      const started = new Promise<void>((resolve) => {
        ready = resolve;
      });
      writer = rawDb.$transaction(async (tx) => {
        writerPid = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0]!
          .pid;
        ready();
        await tx.organisationMembership.updateMany({
          where: { organisationId, personId: admin.id },
          data: { role: 'MEMBER' },
        });
      });
      await started;
      await expect
        .poll(async () => {
          const rows = await rawDb.$queryRaw<Array<{ waiting: boolean }>>`
        SELECT cardinality(pg_blocking_pids(${writerPid})) > 0 AS waiting`;
          return rows[0]?.waiting;
        })
        .toBe(true);
      return member;
    });
  try {
    expect((await post(reopenBody())).status).toBe(200);
  } finally {
    spy.mockRestore();
    await writer;
  }
  expect((await state()).status).toBe('LIVE');
});

it.each(['supersession', 'reminder cancellation', 'publication', 'retry settlement'])(
  'rolls back the entire reopen when %s fails and allows a clean retry',
  async (failure) => {
    const error = new Error('Reopen rollback drill');
    const spy =
      failure === 'supersession'
        ? vi.spyOn(snapshotRepo, 'supersedeFinalSnapshots').mockRejectedValueOnce(error)
        : failure === 'reminder cancellation'
          ? vi.spyOn(reminderRepo, 'cancelArchiveReminders').mockRejectedValueOnce(error)
          : failure === 'publication'
            ? vi.spyOn(cacheBus, 'publishCacheEvent').mockRejectedValueOnce(error)
            : vi.spyOn(idempotency, 'settleReserved').mockRejectedValueOnce(error);
    const body = reopenBody();
    try {
      expect((await post(body)).status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect(await state()).toMatchObject({
      status: 'CLOSED',
      closedAt: FROZEN_NOW,
      lifecycleVersion: version,
    });
    expect((await snapshots())[0]?.supersededAt).toBeNull();
    expect((await reminders())[0]?.status).toBe('PENDING');
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'event.transition' } })).toBe(1);
    expect((await post(body)).status).toBe(200);
  },
);

it('serializes competing reopens and refuses stale or repeated transitions', async () => {
  expect((await post({ ...reopenBody(), expectedVersion: version + 1 })).status).toBe(409);
  const results = await Promise.all([post(reopenBody()), post(reopenBody())]);
  expect(results.map((row) => row.status).sort()).toEqual([200, 409]);
  expect((await post({ ...reopenBody(), expectedVersion: version + 1 })).status).toBe(409);
  expect(await rawDb.auditLog.count({ where: { eventId, action: 'event.transition' } })).toBe(2);
});

it('cancels a claimed obsolete reminder and preserves unrelated or terminal actions', async () => {
  const reminder = (await reminders())[0]!;
  await rawDb.scheduledAction.update({
    where: { id: reminder.id, eventId },
    data: {
      status: 'RUNNING',
      lockedBy: 'worker',
      lockedUntil: new Date(FROZEN_NOW.getTime() + 60_000),
    },
  });
  const unrelated = await rawDb.scheduledAction.create({
    data: { eventId, type: 'report.snapshot', payload: {}, runAt: FROZEN_NOW },
  });
  const terminal = await rawDb.scheduledAction.create({
    data: {
      eventId,
      type: 'event.archiveReminder',
      payload: {},
      runAt: FROZEN_NOW,
      status: 'SUCCEEDED',
      completedAt: FROZEN_NOW,
    },
  });
  expect((await post(reopenBody())).status).toBe(200);
  const rows = await reminders();
  expect(rows.find((row) => row.id === reminder.id)).toMatchObject({
    status: 'CANCELLED',
    lockedBy: null,
    lockedUntil: null,
  });
  expect(rows.find((row) => row.id === unrelated.id)).toEqual(unrelated);
  expect(rows.find((row) => row.id === terminal.id)).toEqual(terminal);
});

it('keeps other events isolated and refuses a membership from the wrong event', async () => {
  const other = await createEvent({
    organisationId,
    slug: 'other-reopen',
    name: 'Other reopen',
    timezone: 'Europe/London',
    status: 'CLOSED',
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
  const report = await rawDb.reportSnapshot.create({
    data: {
      eventId: other.id,
      kind: 'FINAL',
      lifecycleVersion: 0,
      dedupeKey: 'final:0',
      report: {},
    },
  });
  const reminder = await rawDb.scheduledAction.create({
    data: { eventId: other.id, type: 'event.archiveReminder', payload: {}, runAt: FROZEN_NOW },
  });
  expect((await post(reopenBody(), other.id)).status).toBe(404);
  expect((await post(reopenBody())).status).toBe(200);
  expect(
    await rawDb.reportSnapshot.findUniqueOrThrow({ where: { eventId: other.id, id: report.id } }),
  ).toEqual(report);
  expect(
    await rawDb.scheduledAction.findUniqueOrThrow({
      where: { eventId: other.id, id: reminder.id },
    }),
  ).toEqual(reminder);
  expect((await rawDb.event.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('CLOSED');
});
