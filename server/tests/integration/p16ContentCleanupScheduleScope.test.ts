import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { contentScheduledHandlers } from '../../src/modules/content/jobs.js';
import {
  useContentStorage,
  type ContentStorage,
} from '../../src/modules/content/application/storage.js';
import * as audit from '../../src/platform/audit/index.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const type = 'content.storage.prune';
const dedupeKey = 'recurring:[null,"content.storage.prune"]';
const registry = new HandlerRegistry(contentScheduledHandlers);
const objects = new Set<string>();
const storage: ContentStorage = {
  issueImage: vi.fn(async () => ({ url: 'https://unused.test', fields: {} })),
  copyImage: vi.fn(async ({ key }) => ({ key, contentType: 'image/png', contentLength: 20 })),
  read: vi.fn(async () => ({ body: Buffer.from('unused'), contentType: 'image/png' })),
  publish: vi.fn(async ({ body }) => ({ body, objectKey: 'unused', etag: '"unused"' })),
  deleteObject: vi.fn(async (key) => {
    objects.delete(key);
  }),
};
let eventId: string;
let restore: () => void;
beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  objects.clear();
  vi.clearAllMocks();
  restore = useContentStorage(storage);
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

async function arrange() {
  const id = randomUUID();
  const key = `content/${eventId}/${id}.json`;
  objects.add(key);
  const intent = await rawDb.contentStorageIntent.create({
    data: {
      id,
      eventId,
      targetEventId: eventId,
      contentVersionId: id,
      objectKeys: [key],
      createdAt: new Date(FROZEN_NOW.getTime() - 7200_000),
      cleanupAfter: new Date(FROZEN_NOW.getTime() - 3600_000),
    },
  });
  const action = await rawDb.scheduledAction.create({
    data: {
      eventId: null,
      createdByPersonId: null,
      type,
      payload: {},
      recurrence: 3600,
      dedupeKey,
      runAt: FROZEN_NOW,
      scheduledFor: FROZEN_NOW,
    },
  });
  return { intent, action, key };
}
async function execute(now = FROZEN_NOW) {
  const clock = fixedClock(now);
  const claims = await claimDueActions({
    workerId: 'cleanup-scope-regression',
    types: [type],
    clock,
  });
  expect(claims).toHaveLength(1);
  return runClaimedAction({ claim: claims[0]!, registry, clock });
}

it('completes the real global handler with same-scope cleanup and outcome audits plus one successor', async () => {
  const { intent, action, key } = await arrange();
  expect(await execute()).toBe('SUCCEEDED');
  expect(storage.deleteObject).toHaveBeenCalledExactlyOnceWith(key);
  expect(objects.size).toBe(0);
  expect(await rawDb.contentStorageIntent.count({ where: { id: intent.id } })).toBe(0);
  const rows = await rawDb.auditLog.findMany({
    where: { scheduledActionId: action.id },
    orderBy: { createdAt: 'asc' },
  });
  expect(rows).toHaveLength(2);
  expect(
    rows.every(
      (row) =>
        row.eventId === null &&
        row.membershipId === null &&
        row.source === 'SCHEDULE' &&
        row.actorId === null &&
        row.actorSub === 'system',
    ),
  ).toBe(true);
  expect(rows.find((row) => row.action === type)).toMatchObject({
    entityType: 'ContentStorageIntent',
    entityId: intent.id,
    after: {
      objects: 1,
      completed: true,
      reason: 'uncommitted-storage',
      ownerEventId: eventId,
      targetEventId: eventId,
    },
  });
  expect(rows.find((row) => row.action === 'schedule.execute')?.after).toEqual({
    type,
    status: 'SUCCEEDED',
    attempts: 1,
    dueAt: FROZEN_NOW.toISOString(),
    error: null,
  });
  expect(await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } })).toMatchObject(
    { status: 'SUCCEEDED', attempts: 1, dedupeKey: null },
  );
  expect(await rawDb.scheduledAction.findUniqueOrThrow({ where: { dedupeKey } })).toMatchObject({
    eventId: null,
    createdByPersonId: null,
    type,
    recurrence: 3600,
    status: 'PENDING',
    attempts: 0,
    scheduledFor: new Date(FROZEN_NOW.getTime() + 3600_000),
  });
  expect(await rawDb.scheduledAction.count()).toBe(2);
});

it('retains the storage intent and failed audit after rollback, then safely retries already absent bytes', async () => {
  const { intent, action, key } = await arrange();
  vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('Synthetic audit outage'));
  expect(await execute()).toBe('PENDING');
  expect(objects.has(key)).toBe(false);
  expect(await rawDb.contentStorageIntent.count({ where: { id: intent.id } })).toBe(1);
  const failure = await rawDb.auditLog.findFirstOrThrow({
    where: { scheduledActionId: action.id },
  });
  expect(failure).toMatchObject({
    eventId: null,
    action: 'schedule.execute',
    after: { type, status: 'PENDING', attempts: 1, error: 'EXECUTION_FAILED' },
  });
  const retry = await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } });
  expect(await execute(retry.runAt)).toBe('SUCCEEDED');
  expect(storage.deleteObject).toHaveBeenCalledTimes(2);
  expect(await rawDb.contentStorageIntent.count({ where: { id: intent.id } })).toBe(0);
  expect(await rawDb.auditLog.findUniqueOrThrow({ where: { id: failure.id } })).toEqual(failure);
  expect(
    await rawDb.auditLog.count({ where: { scheduledActionId: action.id, action: type } }),
  ).toBe(1);
  expect(
    await rawDb.auditLog.count({
      where: { scheduledActionId: action.id, action: 'schedule.execute' },
    }),
  ).toBe(2);
  expect(await rawDb.scheduledAction.count()).toBe(2);
});

it('keeps the database refusal for an event audit referencing a global scheduled action', async () => {
  const { intent, action } = await arrange();
  await expect(
    rawDb.auditLog.create({
      data: {
        actorSub: 'system',
        eventId,
        source: 'SCHEDULE',
        scheduledActionId: action.id,
        action: type,
        entityType: 'ContentStorageIntent',
        entityId: intent.id,
      },
    }),
  ).rejects.toBeDefined();
  expect(await rawDb.auditLog.count()).toBe(0);
  expect(await rawDb.contentStorageIntent.count({ where: { id: intent.id } })).toBe(1);
  expect(await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } })).toMatchObject(
    { eventId: null, status: 'PENDING', attempts: 0 },
  );
});
