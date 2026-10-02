import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { requireCurrentCapability } from '../../src/platform/access/currentCapability.js';
import { jsonNull } from '../../src/platform/db/client.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import type { ClaimedAction } from '../../src/platform/scheduler/claimRepo.js';
import * as outcomeAudit from '../../src/platform/scheduler/executionAudit.js';
import * as executionRepo from '../../src/platform/scheduler/executionRepo.js';
import { ScheduleRefusal } from '../../src/platform/scheduler/failure.js';
import {
  defineScheduledHandler,
  type ScheduleContext,
} from '../../src/platform/scheduler/handler.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, testEvent, type TestVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const TYPE = 'test.counter';
const clock = fixedClock(FROZEN_NOW);
const schema = z.object({ delta: z.number().int().min(1).max(10) }).strict();
let eventId: string;
let creator: TestVolunteer;
let membershipId: string;
let initialCount: number;

const row = (id: string) => rawDb.scheduledAction.findUniqueOrThrow({ where: { id } });
const audits = (id: string) => rawDb.auditLog.findMany({ where: { scheduledActionId: id } });
const count = async () =>
  (await rawDb.event.findUniqueOrThrow({ where: { id: eventId } })).dayBoundaryMinutes;
const create = (data = {}) =>
  rawDb.scheduledAction.create({
    data: {
      eventId,
      type: TYPE,
      payload: { delta: 1 },
      runAt: FROZEN_NOW,
      createdByPersonId: creator.id,
      ...data,
    },
  });
const claim = async (instant = FROZEN_NOW) =>
  (
    await claimDueActions({
      workerId: 'worker',
      types: [TYPE],
      clock: fixedClock(instant),
    })
  )[0]!;

async function authorize(context: ScheduleContext) {
  const { action, audit, tx } = context;
  if (action.createdByPersonId === null || audit.membershipId === null || action.eventId === null) {
    throw new ScheduleRefusal('AUTHORITY_CHANGED');
  }
  await requireCurrentCapability(tx, {
    scope: { eventId: action.eventId },
    membershipId: audit.membershipId,
    personId: action.createdByPersonId,
    capability: 'config.manage',
  });
}

async function increment(context: ScheduleContext, payload: { delta: number }) {
  await context.tx.event.update({
    where: { id: eventId },
    data: { dayBoundaryMinutes: { increment: payload.delta } },
  });
}

function registry(run = increment, authority = authorize) {
  return new HandlerRegistry([
    defineScheduledHandler({ type: TYPE, schema, authorize: authority, run }),
  ]);
}
function execute(action: ClaimedAction, handlers = registry(), instant = FROZEN_NOW) {
  return runClaimedAction({ claim: action, registry: handlers, clock: fixedClock(instant) });
}
const systemAuthority = async (context: ScheduleContext) => {
  if (context.action.createdByPersonId !== null) throw new ScheduleRefusal('SYSTEM_ONLY');
};

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  creator = await createVolunteer({ email: 'scheduler-authority@test.example', role: 'ADMIN' });
  membershipId = (
    await rawDb.eventMembership.findUniqueOrThrow({
      where: { eventId_personId: { eventId, personId: creator.id } },
    })
  ).id;
  initialCount = await count();
});

it('commits effects, completion and correctly attributed schedule audit in one transaction', async () => {
  const action = await create();
  expect(await execute(await claim())).toBe('SUCCEEDED');
  expect(await count()).toBe(initialCount + 1);
  expect(await row(action.id)).toMatchObject({
    status: 'SUCCEEDED',
    attempts: 1,
    version: 3,
    lockedBy: null,
    lockedUntil: null,
    completedAt: FROZEN_NOW,
    lastError: null,
  });
  expect(await audits(action.id)).toEqual([
    expect.objectContaining({
      actorId: creator.id,
      actorSub: creator.sub,
      membershipId,
      eventId,
      source: 'SCHEDULE',
      scheduledActionId: action.id,
      action: 'schedule.execute',
      outcome: 'SUCCESS',
      severity: 'INFO',
      after: {
        type: TYPE,
        status: 'SUCCEEDED',
        attempts: 1,
        dueAt: FROZEN_NOW.toISOString(),
        error: null,
      },
    }),
  ]);
});

it('serializes duplicate executors and applies a claimed effect once', async () => {
  const action = await create();
  const token = await claim();
  expect((await Promise.all([execute(token), execute(token)])).sort()).toEqual([
    'STALE',
    'SUCCEEDED',
  ]);
  expect(await count()).toBe(initialCount + 1);
  expect(await audits(action.id)).toHaveLength(1);
});

it('two real workers claim and execute distinct actions once over repeated rounds', async () => {
  for (let round = 0; round < 3; round++) {
    await rawDb.scheduledAction.createMany({
      data: Array.from({ length: 10 }, () => ({
        eventId,
        type: TYPE,
        payload: { delta: 1 },
        runAt: FROZEN_NOW,
        createdByPersonId: creator.id,
      })),
    });
    const [one, two] = await Promise.all([
      claimDueActions({ workerId: 'one', types: [TYPE], clock }),
      claimDueActions({ workerId: 'two', types: [TYPE], clock }),
    ]);
    expect(one).toHaveLength(5);
    expect(two).toHaveLength(5);
    const runBatch = async (batch: ClaimedAction[]) => {
      for (const action of batch) expect(await execute(action)).toBe('SUCCEEDED');
    };
    await Promise.all([runBatch(one), runBatch(two)]);
    expect(await count()).toBe(initialCount + (round + 1) * 10);
    for (const action of [...one, ...two]) expect(await audits(action.id)).toHaveLength(1);
  }
});

it('executes a platform action with null event scope and a paired schedule-source audit', async () => {
  const action = await create({ eventId: null, createdByPersonId: null });
  const handlers = registry(async (context) => {
    await context.tx.idempotencyRecord.create({
      data: {
        key: 'platform-scheduler-test',
        eventId: null,
        endpoint: 'test.platform',
        actorSub: 'system',
        responseBody: {},
        statusCode: 200,
        createdAt: context.now,
      },
    });
  }, systemAuthority);
  expect(await execute(await claim(), handlers)).toBe('SUCCEEDED');
  expect(await rawDb.idempotencyRecord.count()).toBe(1);
  expect(await audits(action.id)).toEqual([
    expect.objectContaining({
      eventId: null,
      actorId: null,
      actorSub: 'system',
      membershipId: null,
      source: 'SCHEDULE',
      scheduledActionId: action.id,
    }),
  ]);
});

it('cannot execute a token with a different event scope', async () => {
  const action = await create();
  const token = await claim();
  expect(await execute({ ...token, eventId: null })).toBe('STALE');
  expect(await count()).toBe(initialCount);
  expect(await audits(action.id)).toHaveLength(0);
  expect((await row(action.id)).status).toBe('RUNNING');
});

it('fences late workers after lease recovery, including reuse of the worker identity', async () => {
  const action = await create();
  const first = await claim();
  const later = new Date(first.lockedUntil.getTime() + 1);
  expect(await execute(first, registry(), later)).toBe('STALE');
  const second = await claim(later);
  expect(await execute(first, registry(), later)).toBe('STALE');
  expect(await execute(second, registry(), later)).toBe('SUCCEEDED');
  expect(await count()).toBe(initialCount + 1);
  expect(await audits(action.id)).toHaveLength(1);
});

it.each(['role', 'deactivation', 'membership removal'])(
  'refuses authority changed after scheduling: %s',
  async (change) => {
    const action = await create();
    const token = await claim();
    if (change === 'membership removal') {
      await rawDb.eventMembership.delete({ where: { id: membershipId, eventId } });
    } else {
      await rawDb.eventMembership.update({
        where: { id: membershipId, eventId },
        data: change === 'role' ? { role: 'VOLUNTEER' } : { status: 'DEACTIVATED' },
      });
    }
    expect(await execute(token)).toBe('FAILED');
    expect(await count()).toBe(initialCount);
    expect(await row(action.id)).toMatchObject({
      status: 'FAILED',
      lastError: 'AUTHORITY_CHANGED',
      attempts: 1,
    });
    expect(await audits(action.id)).toEqual([
      expect.objectContaining({ outcome: 'DENIED', source: 'SCHEDULE' }),
    ]);
  },
);

it('validates stored payload before authority or effects and stores no payload detail in the error', async () => {
  const action = await create({
    payload: { delta: 'token-secret-value', extra: 'private-description' },
  });
  const authority = vi.fn(authorize);
  expect(await execute(await claim(), registry(increment, authority))).toBe('FAILED');
  expect(authority).not.toHaveBeenCalled();
  expect(await count()).toBe(initialCount);
  expect((await row(action.id)).lastError).toBe('INVALID_PAYLOAD');
  expect(JSON.stringify(await audits(action.id))).not.toMatch(
    /token-secret-value|private-description/,
  );
});

it.each(['TOO_LATE', 'GUARD_FAILED'] as const)(
  'records %s as a terminal refusal rather than retrying',
  async (code) => {
    const action = await create();
    expect(
      await execute(
        await claim(),
        registry(async () => {
          throw new ScheduleRefusal(code);
        }),
      ),
    ).toBe('FAILED');
    expect(await count()).toBe(initialCount);
    expect(await row(action.id)).toMatchObject({
      status: 'FAILED',
      lastError: code,
      completedAt: FROZEN_NOW,
    });
  },
);

it('rolls back a throwing handler, retries at every backoff boundary and dead-letters its final failure', async () => {
  const action = await create();
  const fail = registry(async (context, payload) => {
    await increment(context, payload);
    throw new Error('SELECT private_token FROM staff WHERE password=secret');
  });
  let instant = FROZEN_NOW;
  const delays = [30, 120, 600, 1800];
  for (let attempt = 1; attempt <= 5; attempt++) {
    const token = await claim(instant);
    expect(await execute(token, fail, instant)).toBe(attempt === 5 ? 'DEAD' : 'PENDING');
    const stored = await row(action.id);
    expect(stored).toMatchObject({
      attempts: attempt,
      lastError: 'EXECUTION_FAILED',
      lockedBy: null,
      lockedUntil: null,
      scheduledFor: FROZEN_NOW,
    });
    expect(await count()).toBe(initialCount);
    if (attempt < 5) {
      expect(stored.completedAt).toBeNull();
      expect(stored.runAt.getTime() - instant.getTime()).toBe(delays[attempt - 1]! * 1000);
      expect(await claim(new Date(stored.runAt.getTime() - 1))).toBeUndefined();
      instant = stored.runAt;
    } else {
      expect(stored.completedAt).toEqual(instant);
      expect(await claim(new Date(instant.getTime() + 86400_000))).toBeUndefined();
    }
  }
  const outcomes = await audits(action.id);
  expect(outcomes).toHaveLength(5);
  expect(
    outcomes.some((entry) => entry.severity === 'CRITICAL' && entry.outcome === 'FAILURE'),
  ).toBe(true);
  expect(JSON.stringify(outcomes)).not.toMatch(/private_token|password=secret/);
  expect(
    outcomes.every(
      (entry) => (entry.after as { dueAt: string }).dueAt === FROZEN_NOW.toISOString(),
    ),
  ).toBe(true);
});

it('a clean retry commits one effect after the first handler failure rolled back', async () => {
  const action = await create();
  const fail = registry(async (context, payload) => {
    await increment(context, payload);
    throw new Error('temporary');
  });
  expect(await execute(await claim(), fail)).toBe('PENDING');
  const next = (await row(action.id)).runAt;
  const recovered = registry(async (context, payload) => {
    expect(context.action.scheduledFor).toEqual(FROZEN_NOW);
    expect(context.action.runAt).toEqual(next);
    await increment(context, payload);
  });
  expect(await execute(await claim(next), recovered, next)).toBe('SUCCEEDED');
  expect(await count()).toBe(initialCount + 1);
  expect(await row(action.id)).toMatchObject({ attempts: 2, lastError: null, status: 'SUCCEEDED' });
  expect(await audits(action.id)).toHaveLength(2);
});

it.each(['completion', 'audit', 'next occurrence'])(
  'rolls back handler effects when %s storage fails',
  async (stage) => {
    const action = await create({
      createdByPersonId: null,
      recurrence: 60,
      dedupeKey: 'system:test:counter',
    });
    const spy =
      stage === 'completion'
        ? vi.spyOn(executionRepo, 'finishAction').mockRejectedValueOnce(new Error('db unavailable'))
        : stage === 'audit'
          ? vi
              .spyOn(outcomeAudit, 'auditScheduleOutcome')
              .mockRejectedValueOnce(new Error('db unavailable'))
          : vi
              .spyOn(executionRepo, 'enqueueNextOccurrence')
              .mockRejectedValueOnce(new Error('db unavailable'));
    try {
      expect(await execute(await claim(), registry(increment, systemAuthority))).toBe('PENDING');
    } finally {
      spy.mockRestore();
    }
    expect(await count()).toBe(initialCount);
    expect(await rawDb.scheduledAction.count()).toBe(1);
    expect((await row(action.id)).dedupeKey).toBe('system:test:counter');
    expect(await audits(action.id)).toHaveLength(1);
  },
);

it('leaves a recoverable lease when even failure recording cannot commit', async () => {
  const action = await create();
  const token = await claim();
  const spy = vi
    .spyOn(outcomeAudit, 'auditScheduleOutcome')
    .mockRejectedValue(new Error('database unavailable'));
  try {
    await expect(execute(token)).rejects.toThrow('database unavailable');
  } finally {
    spy.mockRestore();
  }
  expect(await count()).toBe(initialCount);
  expect(await row(action.id)).toMatchObject({
    status: 'RUNNING',
    version: token.version,
    attempts: 1,
    lastError: null,
  });
  expect(await audits(action.id)).toHaveLength(0);
  const recoveredAt = new Date(token.lockedUntil.getTime() + 1);
  expect(await execute(await claim(recoveredAt), registry(), recoveredAt)).toBe('SUCCEEDED');
  expect(await count()).toBe(initialCount + 1);
});

it('dead-letters an exhausted crashed final lease without calling the handler', async () => {
  const action = await create({ maxAttempts: 1 });
  const crashed = await claim();
  const recoveryAt = new Date(crashed.lockedUntil.getTime() + 1);
  const run = vi.fn(increment);
  expect(await execute(await claim(recoveryAt), registry(run), recoveryAt)).toBe('DEAD');
  expect(run).not.toHaveBeenCalled();
  expect(await count()).toBe(initialCount);
  expect(await row(action.id)).toMatchObject({
    status: 'DEAD',
    attempts: 1,
    lastError: 'ATTEMPTS_EXHAUSTED',
  });
});

it('creates exactly one next recurring occurrence, preserves scope and skips missed cadence without a catch-up storm', async () => {
  const action = await create({
    createdByPersonId: null,
    recurrence: 60,
    dedupeKey: 'system:counter',
    payload: { delta: 2 },
  });
  const token = await claim();
  const late = new Date(FROZEN_NOW.getTime() + 185_000);
  const handlers = registry(increment, systemAuthority);
  expect(
    (await Promise.all([execute(token, handlers, late), execute(token, handlers, late)])).sort(),
  ).toEqual(['STALE', 'SUCCEEDED']);
  expect(await count()).toBe(initialCount + 2);
  expect(await row(action.id)).toMatchObject({ status: 'SUCCEEDED', dedupeKey: null });
  const next = await rawDb.scheduledAction.findUniqueOrThrow({
    where: { dedupeKey: 'system:counter' },
  });
  expect(next).toMatchObject({
    eventId,
    type: TYPE,
    payload: { delta: 2 },
    recurrence: 60,
    createdByPersonId: null,
    attempts: 0,
    status: 'PENDING',
    runAt: new Date(FROZEN_NOW.getTime() + 240_000),
  });
  expect(await rawDb.scheduledAction.count()).toBe(2);
  expect(await audits(action.id)).toEqual([
    expect.objectContaining({ source: 'SCHEDULE', actorId: null, actorSub: 'system' }),
  ]);
});

it('copies JSON null into a recurring successor using Prisma JSON-null semantics', async () => {
  const action = await create({
    createdByPersonId: null,
    recurrence: 60,
    dedupeKey: 'system:null',
    payload: jsonNull,
  });
  const handlers = new HandlerRegistry([
    defineScheduledHandler({
      type: TYPE,
      schema: z.null(),
      authorize: systemAuthority,
      run: async (context) => {
        await increment(context, { delta: 1 });
      },
    }),
  ]);
  expect(await execute(await claim(), handlers)).toBe('SUCCEEDED');
  expect(
    (await rawDb.scheduledAction.findUniqueOrThrow({ where: { dedupeKey: 'system:null' } }))
      .payload,
  ).toBeNull();
  expect(await audits(action.id)).toHaveLength(1);
});

it('preserves the original recurring cadence after a retry rather than shifting it by backoff', async () => {
  const action = await create({
    createdByPersonId: null,
    recurrence: 60,
    dedupeKey: 'system:retry',
  });
  const failed = registry(async () => {
    throw new Error('temporary');
  }, systemAuthority);
  expect(await execute(await claim(), failed)).toBe('PENDING');
  const retriedAt = (await row(action.id)).runAt;
  expect(
    await execute(await claim(retriedAt), registry(increment, systemAuthority), retriedAt),
  ).toBe('SUCCEEDED');
  expect(
    (await rawDb.scheduledAction.findUniqueOrThrow({ where: { dedupeKey: 'system:retry' } })).runAt,
  ).toEqual(new Date(FROZEN_NOW.getTime() + 60_000));
  expect(await count()).toBe(initialCount + 1);
});

it.each([
  { createdByPersonId: 'creator', dedupeKey: 'recurring:user' },
  { createdByPersonId: null, dedupeKey: null },
])('refuses an unsupported recurring specification before its effects', async (spec) => {
  const action = await create({
    recurrence: 60,
    ...spec,
    createdByPersonId: spec.createdByPersonId === 'creator' ? creator.id : null,
  });
  expect(await execute(await claim(), registry(increment, systemAuthority))).toBe('FAILED');
  expect((await row(action.id)).lastError).toBe('SYSTEM_ONLY');
  expect(await count()).toBe(initialCount);
  expect(await rawDb.scheduledAction.count()).toBe(1);
});

it('records missing handler registration as a refusal if composition changed after claim', async () => {
  const action = await create();
  expect(await execute(await claim(), new HandlerRegistry([]))).toBe('FAILED');
  expect((await row(action.id)).lastError).toBe('HANDLER_UNAVAILABLE');
  expect(await count()).toBe(initialCount);
});

async function waitForEventLock() {
  await expect
    .poll(async () => {
      const rows = await rawDb.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
       AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR UPDATE%'`;
      return Number(rows[0]!.count);
    })
    .toBeGreaterThan(0);
}

it('locks the event before the action so concurrent reopen/archive cancellation can commit', async () => {
  const action = await create();
  const token = await claim();
  let running: Promise<unknown> | undefined;
  try {
    await rawDb.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
        running = execute(token);
        await waitForEventLock();
        await tx.$queryRaw`SELECT id FROM "ScheduledAction" WHERE id = ${action.id} FOR UPDATE NOWAIT`;
        await tx.scheduledAction.update({
          where: { id: action.id },
          data: {
            status: 'CANCELLED',
            lockedBy: null,
            lockedUntil: null,
            completedAt: FROZEN_NOW,
            version: { increment: 1 },
          },
        });
      },
      { timeout: 10_000 },
    );
  } finally {
    if (running) expect(await running).toBe('STALE');
  }
  expect(await count()).toBe(initialCount);
  expect(await audits(action.id)).toHaveLength(0);
});

it('samples the clock after waiting on the event lock and refuses a lease that expired while waiting', async () => {
  await create();
  const token = await claim();
  let instant = FROZEN_NOW;
  let running: Promise<unknown> | undefined;
  try {
    await rawDb.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
        running = runClaimedAction({
          claim: token,
          registry: registry(),
          clock: { now: () => instant },
        });
        await waitForEventLock();
        instant = new Date(token.lockedUntil.getTime() + 1);
      },
      { timeout: 10_000 },
    );
  } finally {
    if (running) expect(await running).toBe('STALE');
  }
  expect(await count()).toBe(initialCount);
});
