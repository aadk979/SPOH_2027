import { prisma } from '../db/client.js';
import { systemClock, type Clock } from '../time/index.js';
import type { ClaimedAction } from './claimRepo.js';
import { auditScheduleOutcome, scheduleAuditContext } from './executionAudit.js';
import { enqueueNextOccurrence, finishAction, lockClaimedAction } from './executionRepo.js';
import { ExhaustedLease, planFailure, ScheduleRefusal } from './failure.js';
import type { HandlerRegistry } from './registry.js';

export interface ExecutionInput {
  claim: ClaimedAction;
  registry: HandlerRegistry;
  clock?: Clock;
}

async function execute(input: ExecutionInput & { clock: Clock }) {
  return prisma.$transaction(
    async (tx) => {
      const locked = await lockClaimedAction(tx, input);
      if (!locked) return 'STALE' as const;
      const { action, now } = locked;
      if (action.exhausted) throw new ExhaustedLease();
      if (
        action.recurrence !== null &&
        (action.dedupeKey === null || action.createdByPersonId !== null)
      ) {
        throw new ScheduleRefusal('SYSTEM_ONLY');
      }
      const handler = input.registry.get(action.type);
      if (!handler) throw new ScheduleRefusal('HANDLER_UNAVAILABLE');
      const audit = await scheduleAuditContext(tx, action);
      await handler.execute({ tx, action, now, audit });
      const result = { status: 'SUCCEEDED' as const, lastError: null, runAt: action.runAt };
      await finishAction(tx, { action, now, result });
      await auditScheduleOutcome(tx, { action, audit, result });
      await enqueueNextOccurrence(tx, { action, now });
      return result.status;
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}

/** A failed handler transaction rolls back before a separate fenced outcome transaction. */
async function recordFailure(error: unknown, input: ExecutionInput & { clock: Clock }) {
  return prisma.$transaction(
    async (tx) => {
      const locked = await lockClaimedAction(tx, input);
      if (!locked) return 'STALE' as const;
      const { action, now } = locked;
      const result = planFailure(error, { action, now });
      const audit = await scheduleAuditContext(tx, action);
      await finishAction(tx, { action, now, result });
      await auditScheduleOutcome(tx, { action, audit, result });
      return result.status;
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}

export async function runClaimedAction(input: ExecutionInput) {
  const execution = { ...input, clock: input.clock ?? systemClock };
  try {
    return await execute(execution);
  } catch (error) {
    return recordFailure(error, execution);
  }
}
