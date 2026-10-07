import { beforeEach, expect, it, vi } from 'vitest';
import { createEvent } from '../../src/modules/event/index.js';
import { lostPersonScheduledHandlers } from '../../src/modules/lostPerson/index.js';
import * as repo from '../../src/modules/lostPerson/data/repo.js';
import * as audit from '../../src/platform/audit/index.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import * as executionRepo from '../../src/platform/scheduler/executionRepo.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const HOUR = 3600_000;
const now = new Date(FROZEN_NOW.getTime() + 900_000);
const at = (offset: number) => new Date(now.getTime() + offset);
const registry = new HandlerRegistry(lostPersonScheduledHandlers);
let eventId: string;
let otherId: string;
let personId: string;
const alert = (id: string, data = {}) =>
  rawDb.lostPersonAlert.create({
    data: {
      id,
      eventId,
      raisedById: personId,
      status: 'RESOLVED_FOUND',
      raisedAt: at(-26 * HOUR),
      resolvedAt: at(-25 * HOUR),
      approxAge: 'private age',
      descriptionText: 'private description',
      clothingText: 'private clothing',
      ...data,
    },
  });
const create = (data = {}) =>
  rawDb.scheduledAction.create({
    data: {
      eventId,
      type: 'lostPerson.purge',
      payload: {},
      runAt: now,
      ...data,
    },
  });
const claim = async (instant = now) =>
  (
    await claimDueActions({
      workerId: 'privacy-worker',
      types: registry.types(),
      clock: fixedClock(instant),
    })
  )[0]!;
const run = async (instant = now) =>
  runClaimedAction({ claim: await claim(instant), registry, clock: fixedClock(instant) });
const policy = (value: number, scopeId = eventId) =>
  rawDb.setting.upsert({
    where: { scope_scopeId_key: { scope: 'EVENT', scopeId, key: 'lostPersonPurgeHours' } },
    create: {
      scope: 'EVENT',
      scopeId,
      eventId: scopeId,
      key: 'lostPersonPurgeHours',
      value,
      version: 1,
    },
    update: { value, version: { increment: 1 } },
  });
const replay = (key: string, replayEvent: string | null, id: string) =>
  rawDb.idempotencyRecord.create({
    data: {
      key,
      eventId: replayEvent,
      endpoint: 'POST /lost-person',
      actorSub: 'private subject',
      statusCode: 201,
      responseBody: { alert: { id, descriptionText: 'private description' } },
    },
  });

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  personId = (await createVolunteer({ email: 'scheduled-privacy@test.example', role: 'ADMIN' })).id;
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  otherId = (
    await createEvent({
      organisationId: event.organisationId,
      slug: 'other-privacy',
      name: 'Other privacy',
      timezone: event.timezone,
      categories: [],
      stationTypes: [],
      shiftTemplates: [],
    })
  ).id;
});

it('atomically scrubs live/practice descriptions and same-event or legacy replays at a strict event cutoff', async () => {
  await policy(2);
  const old = await alert('old', { raisedAt: at(-3 * HOUR - 420_000), resolvedAt: at(-3 * HOUR) });
  await alert('practice', { rehearsal: true });
  await alert('equality', { resolvedAt: at(-2 * HOUR) });
  await alert('active', { status: 'ACTIVE', resolvedAt: at(-25 * HOUR) });
  await alert('unresolved', { resolvedAt: null });
  await alert('already', { purgedAt: at(-HOUR) });
  await alert('other', { eventId: otherId });
  await rawDb.lostPersonAck.create({
    data: { eventId, alertId: old.id, volunteerId: personId, rehearsal: false },
  });
  await replay('scoped', eventId, old.id);
  await replay('legacy', null, old.id);
  await replay('cross-event', otherId, old.id);
  const action = await create();
  expect(await run()).toBe('SUCCEEDED');
  for (const id of ['old', 'practice']) {
    expect(await rawDb.lostPersonAlert.findUniqueOrThrow({ where: { id } })).toMatchObject({
      descriptionText: null,
      clothingText: null,
      approxAge: null,
      purgedAt: now,
    });
  }
  for (const id of ['equality', 'active', 'unresolved', 'already', 'other']) {
    expect((await rawDb.lostPersonAlert.findUniqueOrThrow({ where: { id } })).descriptionText).toBe(
      'private description',
    );
  }
  const summaries = await rawDb.lostPersonSummary.findMany({ orderBy: { rehearsal: 'asc' } });
  expect(summaries).toHaveLength(2);
  expect(summaries[0]).toMatchObject({
    rehearsal: false,
    resolutionMinutes: 7,
    ackCount: 1,
    eventId,
  });
  expect(summaries[1]).toMatchObject({ rehearsal: true, eventId });
  for (const key of ['scoped', 'legacy']) {
    expect(
      (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key } })).responseBody,
    ).toEqual({ alertId: old.id });
  }
  expect(
    JSON.stringify(
      (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: 'cross-event' } }))
        .responseBody,
    ),
  ).toContain('private description');
  const receipts = await rawDb.auditLog.findMany({ where: { scheduledActionId: action.id } });
  expect(receipts.map((row) => row.action).sort()).toEqual([
    'lostPerson.purge',
    'lostPerson.purge',
    'schedule.execute',
  ]);
  expect(
    receipts.every(
      (row) => row.source === 'SCHEDULE' && row.actorId === null && row.eventId === eventId,
    ),
  ).toBe(true);
  expect(JSON.stringify([...summaries, ...receipts])).not.toMatch(
    /private description|private clothing|private age|private subject/,
  );
});

it.each(['summary', 'replay', 'audit', 'completion', 'successor'])(
  'rolls the entire event back after %s failure, then retries once',
  async (stage) => {
    await alert('old-a');
    await alert('old-b');
    await replay('legacy', null, 'old-a');
    const action = await create({ recurrence: 900, dedupeKey: 'recurring:privacy-test' });
    const original = repo.purgeAlert;
    const spy =
      stage === 'summary'
        ? vi.spyOn(repo, 'purgeAlert').mockImplementationOnce(async (...args) => {
            await original(...args);
            throw new Error('private fault');
          })
        : stage === 'replay'
          ? vi.spyOn(repo, 'scrubLegacyReplay').mockRejectedValueOnce(new Error('private fault'))
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
    expect(
      await rawDb.lostPersonAlert.count({
        where: { descriptionText: 'private description', purgedAt: null },
      }),
    ).toBe(2);
    expect(await rawDb.lostPersonSummary.count()).toBe(0);
    expect(await rawDb.auditLog.count({ where: { action: 'lostPerson.purge' } })).toBe(0);
    expect(
      JSON.stringify(
        (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: 'legacy' } }))
          .responseBody,
      ),
    ).toContain('private description');
    expect(await rawDb.scheduledAction.count()).toBe(1);
    const pending = await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } });
    expect(pending).toMatchObject({ attempts: 1, lastError: 'EXECUTION_FAILED' });
    expect(await run(pending.runAt)).toBe('SUCCEEDED');
    expect(await rawDb.lostPersonSummary.count()).toBe(2);
    expect(await rawDb.auditLog.count({ where: { action: 'lostPerson.purge' } })).toBe(2);
    expect(
      (
        await rawDb.scheduledAction.findUniqueOrThrow({
          where: { dedupeKey: 'recurring:privacy-test' },
        })
      ).runAt,
    ).toEqual(at(900_000));
  },
);

it('serialises two real executions for one event so only one creates its summary', async () => {
  await alert('old');
  await create();
  await create();
  const claims = await claimDueActions({
    workerId: 'two-workers',
    types: registry.types(),
    clock: fixedClock(now),
  });
  expect(claims).toHaveLength(2);
  expect(
    await Promise.all(
      claims.map((token) => runClaimedAction({ claim: token, registry, clock: fixedClock(now) })),
    ),
  ).toEqual(['SUCCEEDED', 'SUCCEEDED']);
  expect(await rawDb.lostPersonSummary.count()).toBe(1);
  expect(await rawDb.auditLog.count({ where: { action: 'lostPerson.purge' } })).toBe(1);
});

it.each(['user creator', 'platform scope', 'payload override'])(
  'refuses unsafe maintenance input: %s',
  async (kind) => {
    await alert('old');
    const action = await create(
      kind === 'user creator'
        ? { createdByPersonId: personId }
        : kind === 'platform scope'
          ? { eventId: null }
          : { payload: { eventId: otherId, cutoff: '2099-01-01' } },
    );
    expect(await run()).toBe('FAILED');
    expect(
      (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } })).lastError,
    ).toBe(kind === 'payload override' ? 'INVALID_PAYLOAD' : 'SYSTEM_ONLY');
    expect(
      (await rawDb.lostPersonAlert.findUniqueOrThrow({ where: { id: 'old' } })).purgedAt,
    ).toBeNull();
  },
);

it('reads changed retention after waiting for its event lock', async () => {
  await policy(1);
  await alert('recent', { resolvedAt: at(-2 * HOUR) });
  await create();
  const token = await claim();
  let running: Promise<unknown> | undefined;
  try {
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
      running = runClaimedAction({ claim: token, registry, clock: fixedClock(now) });
      await expect
        .poll(async () => {
          const rows = await rawDb.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR UPDATE%'`;
          return Number(rows[0]!.count);
        })
        .toBeGreaterThan(0);
      await tx.setting.update({
        where: {
          scope_scopeId_key: { scope: 'EVENT', scopeId: eventId, key: 'lostPersonPurgeHours' },
        },
        data: { value: 3, version: { increment: 1 } },
      });
    });
    expect(await running).toBe('SUCCEEDED');
  } finally {
    await running;
  }
  expect(
    (await rawDb.lostPersonAlert.findUniqueOrThrow({ where: { id: 'recent' } })).purgedAt,
  ).toBeNull();
  expect(await rawDb.auditLog.count({ where: { action: 'lostPerson.purge' } })).toBe(0);
});

it('keeps the promised 24 hours without an event value', async () => {
  await alert('recent', { resolvedAt: at(-2 * HOUR) });
  await create();
  expect(await run()).toBe('SUCCEEDED');
  expect(await rawDb.lostPersonSummary.count()).toBe(0);
  expect(
    (await rawDb.lostPersonAlert.findUniqueOrThrow({ where: { id: 'recent' } })).purgedAt,
  ).toBeNull();
});

it('uses the registry default for an invalid event policy and still prunes archived data', async () => {
  await policy(0);
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
  await alert('old');
  await alert('recent', { resolvedAt: at(-2 * HOUR) });
  await create();
  expect(await run()).toBe('SUCCEEDED');
  expect(await rawDb.lostPersonSummary.count()).toBe(1);
  expect(
    (await rawDb.lostPersonAlert.findUniqueOrThrow({ where: { id: 'recent' } })).purgedAt,
  ).toBeNull();
});
