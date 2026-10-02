import { beforeEach, expect, it, vi } from 'vitest';
import { startScheduledJobs } from '../../src/app/startScheduledJobs.js';
import { settingsScheduledHandlers } from '../../src/modules/settings/index.js';
import * as audit from '../../src/platform/audit/index.js';
import { prisma } from '../../src/platform/db/client.js';
import { admitCountCapture } from '../../src/platform/db/countCaptureAdmission.js';
import * as cacheBus from '../../src/platform/events/cacheBus.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import * as executionRepo from '../../src/platform/scheduler/executionRepo.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import * as changes from '../../src/platform/settings/change.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  createStation,
  createVolunteer,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const now = FROZEN_NOW;
const at = (offset: number) => new Date(now.getTime() + offset);
const registry = new HandlerRegistry(settingsScheduledHandlers);
let eventId: string;
let stationId: string;
let creator: TestVolunteer;
let membershipId: string;
const payload = (data = {}) => ({
  scope: 'event',
  scopeId: eventId,
  key: 'capture.open',
  value: false,
  expectedVersion: 0,
  ...data,
});
const create = (data = {}) =>
  rawDb.scheduledAction.create({
    data: {
      eventId,
      type: 'setting.apply',
      payload: payload(),
      runAt: now,
      createdByPersonId: creator.id,
      ...data,
    },
  });
const claims = (instant = now) =>
  claimDueActions({
    workerId: 'setting-worker',
    types: registry.types(),
    clock: fixedClock(instant),
  });
const run = async (instant = now) =>
  runClaimedAction({ claim: (await claims(instant))[0]!, registry, clock: fixedClock(instant) });
const action = (id: string) => rawDb.scheduledAction.findUniqueOrThrow({ where: { id } });
const setting = () => rawDb.setting.findFirst({ where: { eventId, key: 'capture.open' } });
const receipts = (id: string) => rawDb.auditLog.findMany({ where: { scheduledActionId: id } });
const admit = (id = stationId) =>
  prisma.$transaction((tx) =>
    admitCountCapture(tx, { eventId }, { stationId: id, clock: fixedClock(now) }),
  );
const manual = () =>
  changes.changeSetting({
    target: { scope: 'event', eventId },
    key: 'capture.open',
    value: true,
    expectedVersion: 0,
    actorPersonId: creator.id,
    audit: { ...SYSTEM_AUDIT_CONTEXT, eventId, actorId: creator.id },
  });

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  creator = await createVolunteer({ email: 'scheduled-setting@test.example', role: 'ADMIN' });
  stationId = (await createStation({ code: 'TIMED' })).id;
  membershipId = (
    await rawDb.eventMembership.findUniqueOrThrow({
      where: { eventId_personId: { eventId, personId: creator.id } },
    })
  ).id;
});

it.each(['event', 'station'])(
  'atomically writes a %s policy, history and attributed receipts, and controls capture',
  async (scope) => {
    const row = await create({
      payload: payload({
        scope,
        scopeId: scope === 'event' ? eventId : stationId,
        reason: 'Scheduled pause',
      }),
    });
    expect(await run()).toBe('SUCCEEDED');
    expect(await setting()).toMatchObject({
      value: false,
      version: 1,
      updatedByPersonId: creator.id,
    });
    expect(
      await rawDb.settingChange.findFirstOrThrow({ where: { eventId, scheduledActionId: row.id } }),
    ).toMatchObject({
      before: true,
      after: false,
      version: 1,
      actorPersonId: creator.id,
      source: 'SCHEDULE',
      reason: 'Scheduled pause',
    });
    const audits = await receipts(row.id);
    expect(audits.map((entry) => entry.action).sort()).toEqual([
      'schedule.execute',
      'setting.change',
    ]);
    expect(
      audits.every(
        (entry) =>
          entry.eventId === eventId &&
          entry.membershipId === membershipId &&
          entry.actorId === creator.id &&
          entry.actorSub === creator.sub &&
          entry.source === 'SCHEDULE',
      ),
    ).toBe(true);
    await expect(admit()).rejects.toMatchObject({ statusCode: 409 });
    if (scope === 'station') {
      const other = await createStation({ code: 'UNPAUSED' });
      await expect(admit(other.id)).resolves.toMatchObject({ rehearsal: false });
    }
  },
);

it('time travel applies pause/resume at inclusive due boundaries without early effects', async () => {
  await create({ runAt: at(60_000) });
  await create({ runAt: at(120_000), payload: payload({ value: true, expectedVersion: 1 }) });
  expect(await claims(at(59_999))).toEqual([]);
  await expect(admit()).resolves.toMatchObject({ rehearsal: false });
  expect(await run(at(60_000))).toBe('SUCCEEDED');
  await expect(admit()).rejects.toMatchObject({ statusCode: 409 });
  expect(await claims(at(119_999))).toEqual([]);
  expect(await run(at(120_000))).toBe('SUCCEEDED');
  await expect(admit()).resolves.toMatchObject({ rehearsal: false });
  expect(await setting()).toMatchObject({ value: true, version: 2 });
});

it.each(['DEACTIVATED', 'ENDED', 'demoted'] as const)(
  'refuses a creator whose current authority is %s',
  async (change) => {
    const row = await create();
    await rawDb.eventMembership.update({
      where: { id: membershipId },
      data: change === 'demoted' ? { role: 'VOLUNTEER' } : { status: change },
    });
    expect(await run()).toBe('FAILED');
    expect(await action(row.id)).toMatchObject({ lastError: 'AUTHORITY_CHANGED' });
    expect(await setting()).toBeNull();
    expect((await receipts(row.id))[0]).toMatchObject({ outcome: 'DENIED' });
  },
);

it.each(['system creator', 'platform action', 'foreign event', 'foreign station', 'archived'])(
  'refuses unsafe current scope/lifecycle: %s',
  async (kind) => {
    const row = await create(
      kind === 'system creator'
        ? { createdByPersonId: null }
        : kind === 'platform action'
          ? { eventId: null }
          : kind === 'foreign event'
            ? { payload: payload({ scopeId: 'foreign-event' }) }
            : kind === 'foreign station'
              ? { payload: payload({ scope: 'station', scopeId: 'foreign-station' }) }
              : {},
    );
    if (kind === 'archived')
      await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
    expect(await run()).toBe('FAILED');
    expect((await action(row.id)).lastError).toBe(
      kind === 'archived'
        ? 'GUARD_FAILED'
        : kind.startsWith('foreign')
          ? 'TARGET_MISSING'
          : 'AUTHORITY_CHANGED',
    );
    expect(await setting()).toBeNull();
    expect(await rawDb.settingChange.count({ where: { eventId } })).toBe(0);
  },
);

it.each([
  'other key',
  'platform scope',
  'extra event selector',
  'invalid value',
  'negative version',
  'missing version',
])('strictly rejects an unsupported payload: %s', async (kind) => {
  const value =
    kind === 'other key'
      ? payload({ key: 'dashboardPollSeconds', value: 10 })
      : kind === 'platform scope'
        ? payload({ scope: 'platform' })
        : kind === 'extra event selector'
          ? payload({ eventId: 'another-event' })
          : kind === 'invalid value'
            ? payload({ value: 'false' })
            : kind === 'negative version'
              ? payload({ expectedVersion: -1 })
              : { scope: 'event', scopeId: eventId, key: 'capture.open', value: false };
  const row = await create({ payload: value });
  expect(await run()).toBe('FAILED');
  expect((await action(row.id)).lastError).toBe('INVALID_PAYLOAD');
  expect(await setting()).toBeNull();
});

it('refuses to overwrite a manual change made after scheduling', async () => {
  const row = await create();
  await manual();
  expect(await run()).toBe('FAILED');
  expect(await action(row.id)).toMatchObject({ lastError: 'GUARD_FAILED' });
  expect(await setting()).toMatchObject({ value: true, version: 1 });
  expect(await rawDb.settingChange.count({ where: { eventId } })).toBe(1);
});

it('execution uses the current stored payload after claiming', async () => {
  const row = await create();
  const token = (await claims())[0]!;
  await rawDb.scheduledAction.update({
    where: { id: row.id },
    data: { payload: payload({ value: true }) },
  });
  expect(await runClaimedAction({ claim: token, registry, clock: fixedClock(now) })).toBe(
    'SUCCEEDED',
  );
  expect(await setting()).toMatchObject({ value: true });
});

it.each(['handler', 'module audit', 'publication', 'completion', 'outcome audit'])(
  'rolls back policy/history on %s failure, then retries once',
  async (stage) => {
    const row = await create();
    const originalChange = changes.changeSettingInTransaction;
    const originalAudit = audit.writeAudit;
    const spy =
      stage === 'handler'
        ? vi
            .spyOn(changes, 'changeSettingInTransaction')
            .mockImplementationOnce(async (...args) => {
              await originalChange(...args);
              throw new Error('private fault');
            })
        : stage === 'module audit'
          ? vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('private fault'))
          : stage === 'publication'
            ? vi
                .spyOn(cacheBus, 'publishCacheEvent')
                .mockRejectedValueOnce(new Error('private fault'))
            : stage === 'completion'
              ? vi
                  .spyOn(executionRepo, 'finishAction')
                  .mockRejectedValueOnce(new Error('private fault'))
              : vi
                  .spyOn(audit, 'writeAudit')
                  .mockImplementationOnce(originalAudit)
                  .mockRejectedValueOnce(new Error('private fault'));
    try {
      expect(await run()).toBe('PENDING');
    } finally {
      spy.mockRestore();
    }
    expect(await setting()).toBeNull();
    expect(await rawDb.settingChange.count({ where: { eventId } })).toBe(0);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'setting.change' } })).toBe(0);
    const pending = await action(row.id);
    expect(pending.lastError).toBe('EXECUTION_FAILED');
    expect(JSON.stringify(await receipts(row.id))).not.toContain('private fault');
    expect(await run(pending.runAt)).toBe('SUCCEEDED');
    expect(await setting()).toMatchObject({ value: false, version: 1 });
    expect(await rawDb.settingChange.count({ where: { eventId } })).toBe(1);
  },
);

it('two competing actions cannot silently overwrite the same expected version', async () => {
  await create();
  await create({ payload: payload({ value: true }) });
  const tokens = await claims();
  expect(tokens).toHaveLength(2);
  const results = await Promise.all(
    tokens.map((claim) => runClaimedAction({ claim, registry, clock: fixedClock(now) })),
  );
  expect(results.sort()).toEqual(['FAILED', 'SUCCEEDED']);
  expect((await setting())?.version).toBe(1);
  expect(await rawDb.settingChange.count({ where: { eventId } })).toBe(1);
});

it('checks a permission change committed while waiting for the Event lock', async () => {
  const row = await create();
  const token = (await claims())[0]!;
  let running: Promise<unknown> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
    running = runClaimedAction({ claim: token, registry, clock: fixedClock(now) });
    await expect
      .poll(async () => {
        const rows = await rawDb.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR UPDATE%'`;
        return Number(rows[0]!.count);
      })
      .toBeGreaterThan(0);
    await tx.eventMembership.update({ where: { id: membershipId }, data: { role: 'VOLUNTEER' } });
  });
  expect(await running).toBe('FAILED');
  expect((await action(row.id)).lastError).toBe('AUTHORITY_CHANGED');
  expect(await setting()).toBeNull();
});

it('the real API worker composition claims and applies the registered action', async () => {
  const row = await create();
  const worker = await startScheduledJobs(fixedClock(now));
  try {
    await worker.tick();
    expect((await action(row.id)).status).toBe('SUCCEEDED');
    await expect(admit()).rejects.toMatchObject({ statusCode: 409 });
  } finally {
    await worker.stop();
  }
});
