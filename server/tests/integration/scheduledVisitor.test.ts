import { beforeEach, expect, it, vi } from 'vitest';
import { JOBS } from '../../src/app/jobs.js';
import { startScheduledJobs } from '../../src/app/startScheduledJobs.js';
import { createEvent } from '../../src/modules/event/index.js';
import { visitorScheduledHandlers } from '../../src/modules/visitor/index.js';
import {
  createVisitorField,
  updateVisitorField,
} from '../../src/modules/visitor/application/fields.js';
import * as repo from '../../src/modules/visitor/data/repo.js';
import * as audit from '../../src/platform/audit/index.js';
import { SYSTEM_AUDIT_CONTEXT, type ActorContext } from '../../src/platform/http/auditContext.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import * as executionRepo from '../../src/platform/scheduler/executionRepo.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createStation, createVolunteer, testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const DAY = 86400_000;
const now = new Date(FROZEN_NOW.getTime() + 3600_000);
const at = (offset: number) => new Date(now.getTime() + offset);
const registry = new HandlerRegistry(visitorScheduledHandlers);
let eventId: string;
let personId: string;
let earlyId: string;
let actor: ActorContext;
const declaration = (code: string, retentionDays: number) => ({
  code,
  label: code,
  type: 'text' as const,
  classification: 'visitor-personal' as const,
  retentionDays,
  readers: ['CHIEF_COORDINATOR' as const],
  sortOrder: 0,
});
const field = (code: string, days: number, scope = eventId) =>
  rawDb.visitorField.create({
    data: { eventId: scope, ...declaration(code, days) },
  });
async function record(
  id: string,
  rehearsal = false,
  scope = eventId,
  data: Record<string, string> = { early: 'private early', late: 'private late' },
) {
  const category = await rawDb.captureCategory.findFirstOrThrow({ where: { eventId: scope } });
  let station = await rawDb.station.findFirst({ where: { eventId: scope } });
  if (!station) {
    const type = await rawDb.stationType.findFirstOrThrow({ where: { eventId: scope } });
    station = await rawDb.station.create({
      data: { eventId: scope, typeId: type.id, code: 'PRIVACY', name: 'Privacy' },
    });
  }
  await rawDb.registration.create({
    data: {
      id: `reg-${id}`,
      eventId: scope,
      rehearsal,
      categoryId: category.id,
      stationId: station.id,
      recordedById: personId,
      idempotencyKey: `replay-${id}`,
    },
  });
  return rawDb.visitorRecord.create({
    data: { id, eventId: scope, rehearsal, registrationId: `reg-${id}`, data },
  });
}
const create = (data = {}) =>
  rawDb.scheduledAction.create({
    data: {
      eventId,
      type: 'visitor.purge',
      payload: {},
      runAt: now,
      ...data,
    },
  });
const claim = async (instant = now) =>
  (
    await claimDueActions({
      workerId: 'visitor-worker',
      types: registry.types(),
      clock: fixedClock(instant),
    })
  )[0]!;
const run = async (instant = now) =>
  runClaimedAction({ claim: await claim(instant), registry, clock: fixedClock(instant) });
const stored = (id: string) => rawDb.visitorRecord.findUniqueOrThrow({ where: { id } });

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  const person = await createVolunteer({ email: 'scheduled-visitor@test.example', role: 'ADMIN' });
  personId = person.id;
  await createStation({ code: 'PRIVACY' });
  const membership = await rawDb.eventMembership.findUniqueOrThrow({
    where: { eventId_personId: { eventId, personId } },
  });
  actor = {
    volunteerId: personId,
    membershipId: membership.id,
    scope: { eventId },
    audit: {
      ...SYSTEM_AUDIT_CONTEXT,
      actorId: personId,
      actorSub: person.sub,
      eventId,
      membershipId: membership.id,
    },
  };
  earlyId = (await field('early', 1)).id;
  await field('late', 3);
  await rawDb.event.update({
    where: { id: eventId },
    data: { status: 'CLOSED', closedAt: at(-2 * DAY) },
  });
});

it.each(['CLOSED', 'ARCHIVED'] as const)(
  'atomically applies per-field deadlines to both modes in %s without changing counts or another event',
  async (status) => {
    await rawDb.event.update({ where: { id: eventId }, data: { status } });
    await record('live');
    await record('practice', true);
    await record('empty', false, eventId, { early: 'private early' });
    const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
    const other = await createEvent({
      organisationId: event.organisationId,
      slug: 'other-visitor',
      name: 'Other visitor',
      timezone: event.timezone,
      categories: [{ code: 'TEST', label: 'Test' }],
      stationTypes: [{ code: 'OTHER', label: 'Other' }],
      shiftTemplates: [],
    });
    await field('early', 1, other.id);
    const foreign = await record('foreign', false, other.id);
    const action = await create();
    expect(await run()).toBe('SUCCEEDED');
    for (const id of ['live', 'practice']) {
      expect(await stored(id)).toMatchObject({
        data: { late: 'private late' },
        purgeAfter: at(DAY),
      });
    }
    expect(await rawDb.visitorRecord.findUnique({ where: { id: 'empty' } })).toBeNull();
    expect(await stored('foreign')).toEqual(foreign);
    expect(await rawDb.registration.count()).toBe(4);
    const receipts = await rawDb.auditLog.findMany({ where: { scheduledActionId: action.id } });
    expect(receipts.map((row) => row.action).sort()).toEqual(['schedule.execute', 'visitor.purge']);
    expect(receipts.find((row) => row.action === 'visitor.purge')?.after).toEqual({
      field: 'early',
      records: 3,
      reason: 'retention',
    });
    expect(
      receipts.every(
        (row) => row.source === 'SCHEDULE' && row.eventId === eventId && row.actorId === null,
      ),
    ).toBe(true);
    expect(JSON.stringify(receipts)).not.toMatch(/private early|private late/);
  },
);

it('includes equality at a field deadline and audits the deadline backstop without visitor values', async () => {
  await rawDb.event.update({ where: { id: eventId }, data: { closedAt: at(-DAY) } });
  await record('backstop', false, eventId, {
    early: 'private early',
    obsolete: 'private obsolete',
  });
  const action = await create();
  expect(await run()).toBe('SUCCEEDED');
  expect(await rawDb.visitorRecord.count()).toBe(0);
  expect(await rawDb.registration.count()).toBe(1);
  const receipts = await rawDb.auditLog.findMany({
    where: { scheduledActionId: action.id, action: 'visitor.purge' },
  });
  expect(receipts.map((row) => row.after)).toEqual(
    expect.arrayContaining([
      { field: 'early', records: 1, reason: 'retention' },
      { records: 1, reason: 'deadline' },
    ]),
  );
  expect(JSON.stringify(receipts)).not.toContain('private');
});

it.each(['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'missing close'] as const)(
  'preserves all values/deadlines for %s and records only a completion',
  async (phase) => {
    await rawDb.event.update({
      where: { id: eventId },
      data: phase === 'missing close' ? { closedAt: null } : { status: phase },
    });
    const original = await record('retained');
    const action = await create();
    expect(await run()).toBe('SUCCEEDED');
    expect(await stored('retained')).toEqual(original);
    expect(
      (await rawDb.auditLog.findMany({ where: { scheduledActionId: action.id } })).map(
        (row) => row.action,
      ),
    ).toEqual(['schedule.execute']);
  },
);

it.each(['user creator', 'platform scope', 'payload override'])(
  'rejects unsafe maintenance: %s',
  async (kind) => {
    const original = await record('retained');
    const action = await create(
      kind === 'user creator'
        ? { createdByPersonId: personId }
        : kind === 'platform scope'
          ? { eventId: null }
          : { payload: { field: 'late', cutoff: '2099-01-01' } },
    );
    expect(await run()).toBe('FAILED');
    expect(await stored('retained')).toEqual(original);
    expect(
      (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } })).lastError,
    ).toBe(kind === 'payload override' ? 'INVALID_PAYLOAD' : 'SYSTEM_ONLY');
  },
);

it.each(['deadline sync', 'field scrub', 'audit', 'completion', 'successor'])(
  'rolls values and deadlines back on %s failure and retries cleanly',
  async (stage) => {
    const original = await record('retained');
    const action = await create({ recurrence: 3600, dedupeKey: 'recurring:visitor-test' });
    const sync = repo.syncPurgeDeadlines;
    const scrub = repo.purgeFieldValues;
    const spy =
      stage === 'deadline sync'
        ? vi.spyOn(repo, 'syncPurgeDeadlines').mockImplementationOnce(async (...args) => {
            await sync(...args);
            throw new Error('private fault');
          })
        : stage === 'field scrub'
          ? vi.spyOn(repo, 'purgeFieldValues').mockImplementationOnce(async (...args) => {
              await scrub(...args);
              throw new Error('private fault');
            })
          : stage === 'audit'
            ? vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('private fault'))
            : stage === 'completion'
              ? vi
                  .spyOn(executionRepo, 'finishAction')
                  .mockRejectedValueOnce(new Error('private fault'))
              : vi
                  .spyOn(executionRepo, 'enqueueNextOccurrence')
                  .mockRejectedValueOnce(new Error('private fault'));
    try {
      expect(await run()).toBe('PENDING');
    } finally {
      spy.mockRestore();
    }
    expect(await stored('retained')).toEqual(original);
    expect(await rawDb.auditLog.count({ where: { action: 'visitor.purge' } })).toBe(0);
    expect(await rawDb.scheduledAction.count()).toBe(1);
    const pending = await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } });
    expect(pending.lastError).toBe('EXECUTION_FAILED');
    expect(await run(pending.runAt)).toBe('SUCCEEDED');
    expect(await stored('retained')).toMatchObject({
      data: { late: 'private late' },
      purgeAfter: at(DAY),
    });
    expect(await rawDb.auditLog.count({ where: { action: 'visitor.purge' } })).toBe(1);
    expect(
      (
        await rawDb.scheduledAction.findUniqueOrThrow({
          where: { dedupeKey: 'recurring:visitor-test' },
        })
      ).runAt,
    ).toEqual(at(3600_000));
  },
);

async function waitForEventLock() {
  await expect
    .poll(async () => {
      const rows = await rawDb.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(*) FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR UPDATE%'`;
      return Number(rows[0]!.count);
    })
    .toBeGreaterThan(0);
}

it.each(['reopen', 'new close', 'extend retention'])(
  'reads a committed %s after waiting for the Event lock',
  async (change) => {
    const original = await record('retained');
    await create();
    const token = await claim();
    let running: Promise<unknown> | undefined;
    try {
      await rawDb.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
        running = runClaimedAction({ claim: token, registry, clock: fixedClock(now) });
        await waitForEventLock();
        if (change === 'reopen')
          await tx.event.update({
            where: { id: eventId },
            data: { status: 'LIVE', closedAt: null },
          });
        else if (change === 'new close')
          await tx.event.update({ where: { id: eventId }, data: { closedAt: at(-3600_000) } });
        else await tx.visitorField.update({ where: { id: earlyId }, data: { retentionDays: 3 } });
      });
      expect(await running).toBe('SUCCEEDED');
    } finally {
      await running;
    }
    expect((await stored('retained')).data).toEqual(original.data);
    expect(await rawDb.auditLog.count({ where: { action: 'visitor.purge' } })).toBe(0);
  },
);

it('field updates wait on the Event lock and audit the latest committed policy', async () => {
  let editing: ReturnType<typeof updateVisitorField> | undefined;
  try {
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
      editing = updateVisitorField(earlyId, { retentionDays: 3 }, actor);
      await waitForEventLock();
      await tx.visitorField.update({ where: { id: earlyId }, data: { retentionDays: 7 } });
    });
    expect((await editing)?.retentionDays).toBe(3);
  } finally {
    await editing;
  }
  expect(
    (await rawDb.auditLog.findFirstOrThrow({ where: { action: 'visitorField.update' } })).before,
  ).toMatchObject({ retentionDays: 7 });
});

it('field creation waits on the Event lock and reports a concurrent duplicate as a conflict', async () => {
  let outcome: Promise<unknown> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
    outcome = createVisitorField(declaration('concurrent', 2), actor).then(
      (value) => value,
      (error) => error,
    );
    await waitForEventLock();
    await tx.visitorField.create({ data: { eventId, ...declaration('concurrent', 2) } });
  });
  expect(await outcome).toMatchObject({ statusCode: 409 });
  expect(await rawDb.visitorField.count({ where: { eventId, code: 'concurrent' } })).toBe(1);
});

it('the real API composition seeds the hourly event handler and removes its legacy interval', async () => {
  const worker = await startScheduledJobs(fixedClock(FROZEN_NOW));
  try {
    await worker.tick();
    expect(
      await rawDb.scheduledAction.findFirstOrThrow({ where: { eventId, type: 'visitor.purge' } }),
    ).toMatchObject({
      payload: {},
      createdByPersonId: null,
      recurrence: 3600,
      runAt: now,
    });
    expect(JOBS.some((job) => job.name === 'visitor data purge')).toBe(false);
  } finally {
    await worker.stop();
  }
});
