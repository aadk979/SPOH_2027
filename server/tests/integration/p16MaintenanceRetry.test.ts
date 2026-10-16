import { beforeEach, expect, it, vi, afterEach } from 'vitest';
import { retryContentCleanup } from '../../src/platform/scheduler/maintenanceRetry.js';
import * as audit from '../../src/platform/audit/index.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { prisma } from '../../src/platform/db/client.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const dead = () => ({
  type: 'content.storage.prune',
  eventId: null,
  payload: {},
  status: 'DEAD' as const,
  attempts: 5,
  maxAttempts: 5,
  version: 7,
  recurrence: 3600,
  dedupeKey: 'recurring:[null,"content.storage.prune"]',
  lastError: 'EXECUTION_FAILED',
  runAt: new Date(FROZEN_NOW.getTime() - 1000),
  scheduledFor: new Date(FROZEN_NOW.getTime() - 3600_000),
  completedAt: new Date(FROZEN_NOW.getTime() - 1000),
  createdAt: new Date(FROZEN_NOW.getTime() - 3600_000),
});
const options = {
  clock: { now: () => FROZEN_NOW },
  audit: { ...SYSTEM_AUDIT_CONTEXT, source: 'SYSTEM' as const },
};
const apply = (id: string) =>
  retryContentCleanup(
    {
      id,
      apply: true,
      expectedVersion: 7,
      reason: 'Synthetic verified storage repair',
      operatorReference: 'Synthetic operator test',
    },
    options,
  );
beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());

it('plans the exact failed global cleanup without writes, leases or audit mutations', async () => {
  const row = await rawDb.scheduledAction.create({ data: dead() });
  const plan = await retryContentCleanup({ id: row.id, apply: false }, options);
  expect(plan.dryRun).toBe(true);
  expect(plan.action).toMatchObject({
    id: row.id,
    type: row.type,
    version: 7,
    attempts: 5,
    status: 'DEAD',
  });
  expect(await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
  expect(await rawDb.auditLog.count()).toBe(0);
});

it('records the old exhausted attempt and restarts only its reviewed recurring action', async () => {
  const row = await rawDb.scheduledAction.create({ data: dead() });
  await prisma.$transaction((tx) =>
    audit.writeAudit(tx, {
      ...SYSTEM_AUDIT_CONTEXT,
      action: 'schedule.execute',
      entityType: 'ScheduledAction',
      entityId: row.id,
      severity: 'CRITICAL',
      outcome: 'FAILURE',
      after: { status: 'DEAD', attempts: 5 },
    }),
  );
  const failure = await rawDb.auditLog.findFirstOrThrow({ where: { action: 'schedule.execute' } });
  expect(await apply(row.id)).toMatchObject({
    dryRun: false,
    action: { id: row.id, status: 'PENDING', version: 8, attempts: 0 },
  });
  const after = await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: row.id } });
  expect(after).toMatchObject({
    ...row,
    status: 'PENDING',
    version: 8,
    attempts: 0,
    lastError: null,
    completedAt: null,
    runAt: FROZEN_NOW,
  });
  expect(await rawDb.auditLog.findUniqueOrThrow({ where: { id: failure.id } })).toEqual(failure);
  const receipt = await rawDb.auditLog.findFirstOrThrow({ where: { action: 'schedule.retry' } });
  expect(receipt.before).toMatchObject({
    id: row.id,
    status: 'DEAD',
    version: 7,
    attempts: 5,
    lastError: 'EXECUTION_FAILED',
  });
  expect(receipt.after).toMatchObject({
    status: 'PENDING',
    version: 8,
    attempts: 0,
    reason: 'Synthetic verified storage repair',
  });
  await expect(apply(row.id)).rejects.toMatchObject({ statusCode: 409 });
  expect(await rawDb.auditLog.count({ where: { action: 'schedule.retry' } })).toBe(1);
});

it.each(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] as const)(
  'cannot redrive a cleanup action whose status is %s',
  async (status) => {
    const row = await rawDb.scheduledAction.create({
      data: {
        ...dead(),
        status,
        ...(status === 'PENDING' || status === 'RUNNING' ? { completedAt: null } : {}),
        ...(status === 'RUNNING' ? { lockedBy: 'existing-worker', lockedUntil: FROZEN_NOW } : {}),
      },
    });
    await expect(apply(row.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
    expect(await rawDb.auditLog.count()).toBe(0);
  },
);

it.each(['kind', 'event', 'creator', 'recurrence', 'dedupe'] as const)(
  'does not expose or retry a nonmatching %s',
  async (mismatch) => {
    const { eventId } = await testEvent();
    const changes =
      mismatch === 'kind'
        ? { type: 'session.prune' }
        : mismatch === 'event'
          ? { eventId }
          : mismatch === 'creator'
            ? { createdByPersonId: 'nonexistent-person' }
            : mismatch === 'recurrence'
              ? { recurrence: 1 }
              : { dedupeKey: 'unrecognised-key' };
    // Use the event's real person for the creator foreign key.
    if (mismatch === 'creator') {
      const { createVolunteer } = await import('../helpers/fixtures.js');
      changes.createdByPersonId = (
        await createVolunteer({ email: 'retry-creator@example.test', role: 'IC' })
      ).id;
    }
    const row = await rawDb.scheduledAction.create({ data: { ...dead(), ...changes } });
    await expect(apply(row.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
    expect(await rawDb.auditLog.count({ where: { action: 'schedule.retry' } })).toBe(0);
  },
);

it.each(['version', 'attempts', 'lease', 'completion', 'error'] as const)(
  'refuses an unreviewed or ineligible %s',
  async (mismatch) => {
    const changes =
      mismatch === 'version'
        ? { version: 8 }
        : mismatch === 'attempts'
          ? { attempts: 4 }
          : mismatch === 'lease'
            ? { lockedBy: 'other-worker', lockedUntil: FROZEN_NOW }
            : mismatch === 'completion'
              ? { completedAt: null }
              : { lastError: 'GUARD_FAILED' };
    if (mismatch === 'lease' || mismatch === 'completion') {
      await expect(
        rawDb.scheduledAction.create({ data: { ...dead(), ...changes } }),
      ).rejects.toThrow('ScheduledAction_' + mismatch + '_check');
      expect(await rawDb.scheduledAction.count()).toBe(0);
      return;
    }
    const row = await rawDb.scheduledAction.create({ data: { ...dead(), ...changes } });
    await expect(apply(row.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
    expect(await rawDb.auditLog.count()).toBe(0);
  },
);

it('rolls the queued retry back if its audit cannot be committed', async () => {
  const row = await rawDb.scheduledAction.create({ data: dead() });
  vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('Synthetic audit outage'));
  await expect(apply(row.id)).rejects.toThrow('Synthetic audit outage');
  expect(await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
});

it('allows only one concurrent retry of a reviewed version', async () => {
  const row = await rawDb.scheduledAction.create({ data: dead() });
  const results = await Promise.allSettled([apply(row.id), apply(row.id)]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  expect(await rawDb.auditLog.count({ where: { action: 'schedule.retry' } })).toBe(1);
  expect(await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
    version: 8,
    attempts: 0,
  });
});

it.each([
  { id: '', apply: false },
  { id: 'id', apply: true },
  { id: 'id', apply: true, expectedVersion: 0, reason: 'reason', operatorReference: 'ref' },
  { id: 'id', apply: true, expectedVersion: 1, reason: ' ', operatorReference: 'ref' },
  { id: 'id', apply: true, expectedVersion: 1, reason: 'reason', operatorReference: ' ' },
])('validates operator input before database effects: %j', async (input) => {
  await expect(retryContentCleanup(input, options)).rejects.toMatchObject({ statusCode: 400 });
  expect(await rawDb.auditLog.count()).toBe(0);
});
