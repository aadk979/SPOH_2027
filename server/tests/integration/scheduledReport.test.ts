import { FullReport } from '@spoh/shared';
import { beforeEach, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app/createApp.js';
import { startScheduledJobs } from '../../src/app/startScheduledJobs.js';
import { createEvent } from '../../src/modules/event/index.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, idempotencyKey } from '../helpers/fixtures.js';
import {
  reportNow,
  scheduledReportFixture,
  type ScheduledReportFixture,
} from '../helpers/scheduledReport.js';

let f: ScheduledReportFixture;
beforeEach(async () => {
  await resetDatabase();
  f = await scheduledReportFixture();
});

it.each([false, true])(
  'stores a bounded completed-day report with includeRehearsal=%s and metadata-only receipts',
  async (includeRehearsal) => {
    const live = await f.registration();
    await f.registration(true);
    await f.registration(false, new Date(f.start.getTime() - 1));
    await f.registration(false, f.end);
    await rawDb.visitorRecord.create({
      data: {
        eventId: f.eventId,
        registrationId: live.id,
        rehearsal: false,
        data: { contact: 'private visitor sentinel' },
      },
    });
    await rawDb.lostPersonAlert.create({
      data: {
        eventId: f.eventId,
        raisedById: f.creator.id,
        descriptionText: 'private lost-person sentinel',
      },
    });
    const row = await f.create(includeRehearsal ? { includeRehearsal } : {});
    expect(await f.run()).toBe('SUCCEEDED');
    const [snapshot] = await f.snapshots();
    expect(snapshot).toMatchObject({
      kind: 'DAILY',
      dedupeKey: `daily:scheduled:${row.id}`,
      createdByPersonId: f.creator.id,
      createdAt: reportNow,
      rehearsalIncluded: includeRehearsal,
    });
    const saved = FullReport.parse(snapshot!.report);
    expect(saved.range).toEqual({ from: f.start.toISOString(), to: f.end.toISOString() });
    expect(saved.generatedAt).toBe(reportNow.toISOString());
    expect(saved.registrations.total).toBe(includeRehearsal ? 2 : 1);
    expect(saved.rehearsalIncluded).toBe(includeRehearsal);
    expect(JSON.stringify(saved)).not.toContain('private visitor sentinel');
    expect(JSON.stringify(saved)).not.toContain('private lost-person sentinel');
    const receipts = await f.receipts(row.id);
    expect(receipts.map((entry) => entry.action).sort()).toEqual([
      'report.snapshot',
      'schedule.execute',
    ]);
    expect(
      receipts.every(
        (entry) =>
          entry.actorId === f.creator.id &&
          entry.actorSub === f.creator.sub &&
          entry.membershipId === f.membershipId &&
          entry.source === 'SCHEDULE',
      ),
    ).toBe(true);
    expect(JSON.stringify(receipts)).not.toContain('private');
    expect(await f.claims()).toEqual([]);
  },
);

it('a later capture produces a new daily document while the previous snapshot stays immutable', async () => {
  await f.registration();
  await f.create();
  expect(await f.run()).toBe('SUCCEEDED');
  const old = (await f.snapshots())[0]!;
  await f.registration();
  await f.create();
  expect(await f.run()).toBe('SUCCEEDED');
  const rows = await f.snapshots();
  expect(rows.find((row) => row.id === old.id)).toEqual(old);
  expect(rows.map((row) => FullReport.parse(row.report).registrations.total).sort()).toEqual([
    1, 2,
  ]);
  await expect(
    rawDb.reportSnapshot.update({ where: { id: old.id }, data: { report: {} } }),
  ).rejects.toThrow('Frozen report is immutable');
});

it.each(['DEACTIVATED', 'ENDED', 'demoted', 'missing'] as const)(
  'refuses current creator authority %s',
  async (change) => {
    const row = await f.create();
    if (change === 'missing') await rawDb.eventMembership.delete({ where: { id: f.membershipId } });
    else
      await rawDb.eventMembership.update({
        where: { id: f.membershipId },
        data: change === 'demoted' ? { role: 'VOLUNTEER' } : { status: change },
      });
    expect(await f.run()).toBe('FAILED');
    expect((await f.action(row.id)).lastError).toBe('AUTHORITY_CHANGED');
    expect(await f.snapshots()).toEqual([]);
  },
);

it.each(['system', 'platform', 'missing day', 'archived'])(
  'refuses unsafe scope/target %s',
  async (kind) => {
    const row = await f.create(
      kind === 'missing day' ? { eventDayId: 'missing-day' } : {},
      kind === 'system'
        ? { createdByPersonId: null }
        : kind === 'platform'
          ? { eventId: null }
          : {},
    );
    if (kind === 'archived')
      await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
    expect(await f.run()).toBe('FAILED');
    expect((await f.action(row.id)).lastError).toBe(
      kind === 'missing day'
        ? 'TARGET_MISSING'
        : kind === 'archived'
          ? 'GUARD_FAILED'
          : 'AUTHORITY_CHANGED',
    );
    expect(await f.snapshots()).toEqual([]);
  },
);

it('cannot read another event’s day', async () => {
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: f.eventId } });
  const other = await createEvent({
    organisationId: event.organisationId,
    slug: 'foreign-report',
    name: 'Foreign',
    timezone: 'UTC',
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
  const day = await rawDb.eventDay.create({
    data: { eventId: other.id, date: new Date(`${f.date}T00:00:00Z`), label: 'Other day' },
  });
  const row = await f.create({ eventDayId: day.id });
  expect(await f.run()).toBe('FAILED');
  expect((await f.action(row.id)).lastError).toBe('TARGET_MISSING');
  expect(await f.snapshots()).toEqual([]);
});

it.each([
  { kind: 'final' },
  { eventId: 'foreign' },
  { from: '2026-01-01T00:00:00Z' },
  { to: '2026-01-02T00:00:00Z' },
  { includeRehearsal: 'true' },
  { eventDayId: '' },
])('strictly refuses unsupported selectors/input %j', async (payload) => {
  const row = await f.create(payload);
  expect(await f.run()).toBe('FAILED');
  expect((await f.action(row.id)).lastError).toBe('INVALID_PAYLOAD');
  expect(await f.snapshots()).toEqual([]);
});

it('daily snapshots after close neither replace FINAL nor change frozen default reads', async () => {
  const admin = await createVolunteer({ email: 'daily-close@test.example', role: 'ADMIN' });
  const app = createApp();
  const path = `/api/v1/events/${f.eventId}`;
  const version = (await rawDb.event.findUniqueOrThrow({ where: { id: f.eventId } }))
    .lifecycleVersion;
  const closed = await request(app)
    .post(`${path}/lifecycle`)
    .set('Authorization', bearer(admin))
    .send({ to: 'CLOSED', expectedVersion: version, idempotencyKey: idempotencyKey() });
  expect(closed.status).toBe(200);
  const final = await rawDb.reportSnapshot.findFirstOrThrow({
    where: { eventId: f.eventId, kind: 'FINAL' },
  });
  await f.registration();
  await f.create();
  expect(await f.run()).toBe('SUCCEEDED');
  expect(await rawDb.reportSnapshot.findUniqueOrThrow({ where: { id: final.id } })).toEqual(final);
  const read = await request(app)
    .get(`${path}/reports/summary`)
    .set('Authorization', bearer(f.creator));
  expect(read.status).toBe(200);
  expect(read.body.snapshot).toMatchObject({ id: final.id, kind: 'FINAL' });
  expect(read.body.registrations.total).toBe(0);
  expect(FullReport.parse((await f.snapshots())[0]!.report).registrations.total).toBe(1);
});

it('the real API worker composition stores the registered daily snapshot', async () => {
  const row = await f.create();
  const worker = await startScheduledJobs(fixedClock(reportNow));
  try {
    await worker.tick();
    expect((await f.action(row.id)).status).toBe('SUCCEEDED');
    expect(await f.snapshots()).toHaveLength(1);
  } finally {
    await worker.stop();
  }
});
