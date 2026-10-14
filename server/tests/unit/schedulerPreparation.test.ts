import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ClaimedAction } from '../../src/platform/scheduler/claimRepo.js';
import { defineScheduledHandler } from '../../src/platform/scheduler/handler.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), run: vi.fn(),
  finish: vi.fn(), audit: vi.fn(), next: vi.fn() }));
vi.mock('../../src/platform/db/client.js', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('../../src/platform/scheduler/executionRepo.js', () => ({ lockClaimedAction: mocks.lock,
  finishAction: mocks.finish, enqueueNextOccurrence: mocks.next }));
vi.mock('../../src/platform/scheduler/executionAudit.js', () => ({ auditScheduleOutcome: mocks.audit,
  scheduleAuditContext: async () => ({ actorType: 'SYSTEM', actorId: null, membershipId: null }) }));
const now = new Date('2026-10-14T13:17:22Z');
const claim = { id: 'owned-claim', eventId: 'owned-event', type: 'test.preparation', payload: {},
  recurrence: null, dedupeKey: null, createdByPersonId: 'owned-person', exhausted: false,
  runAt: now, scheduledFor: now, attempts: 1, maxAttempts: 3, lockedBy: 'owned-worker',
  lockedUntil: new Date(now.getTime() + 60_000), version: 1 } satisfies ClaimedAction;
beforeEach(() => {
  vi.clearAllMocks(); mocks.transaction.mockImplementation(async callback => callback({}));
  mocks.lock.mockResolvedValue({ action: claim, now });
});
it('cloud preparation finishes before opening a business transaction and passes the same immutable snapshot', async () => {
  let release!: (value: unknown) => void;
  const snapshot = { selectedRelease: 'immutable-release' };
  const prepare = vi.fn(() => new Promise(resolve => { release = resolve; }));
  const definition = { type: claim.type, schema: z.object({}).strict(), prepare,
    authorize: async () => {}, run: mocks.run };
  const registry = new HandlerRegistry([defineScheduledHandler(definition)]);
  const running = runClaimedAction({ claim, registry });
  await Promise.resolve();
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(mocks.transaction).not.toHaveBeenCalled();
  release(snapshot);
  expect(await running).toBe('SUCCEEDED');
  expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ prepared: snapshot }), {});
});

it('revalidates a cancelled or expired claim after provider preparation, without handler effects', async () => {
  const prepare = vi.fn(async () => {
    mocks.lock.mockResolvedValueOnce(null);
    return { observedBeforeCancellation: true };
  });
  const definition = { type: claim.type, schema: z.object({}).strict(), prepare,
    authorize: vi.fn(), run: mocks.run };
  expect(await runClaimedAction({ claim, registry: new HandlerRegistry([defineScheduledHandler(definition)]) })).toBe('STALE');
  expect(prepare).toHaveBeenCalledTimes(1); expect(definition.authorize).not.toHaveBeenCalled();
  expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.finish).not.toHaveBeenCalled();
});

it('skips cloud preparation for an exhausted claim and records the existing fenced dead outcome', async () => {
  const exhausted = { ...claim, exhausted: true, attempts: 3 };
  mocks.lock.mockResolvedValue({ action: exhausted, now });
  const prepare = vi.fn(async () => ({ unexpected: true }));
  const definition = { type: claim.type, schema: z.object({}).strict(), prepare,
    authorize: vi.fn(), run: mocks.run };
  expect(await runClaimedAction({ claim: exhausted, registry: new HandlerRegistry([defineScheduledHandler(definition)]) })).toBe('DEAD');
  expect(prepare).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
});
