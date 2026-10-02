import { jsonNull, type JsonValue, type PrismaTransactionClient } from '../db/client.js';
import type { Clock } from '../time/index.js';
import type { ClaimedAction } from './claimRepo.js';
import type { FailurePlan } from './failure.js';

/** Event first: reopen/archive cancel action rows while already holding that event lock. */
export async function lockClaimedAction(
  tx: PrismaTransactionClient,
  input: { claim: ClaimedAction; clock: Clock },
) {
  const { claim, clock } = input;
  if (claim.eventId !== null) {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${claim.eventId} FOR UPDATE`;
  }
  await tx.$queryRaw`SELECT id FROM "ScheduledAction" WHERE id = ${claim.id}
    AND "eventId" IS NOT DISTINCT FROM ${claim.eventId} FOR UPDATE`;
  const now = clock.now();
  const row = await tx.scheduledAction.findFirst({
    where: {
      id: claim.id,
      eventId: claim.eventId,
      type: claim.type,
      status: 'RUNNING',
      lockedBy: claim.lockedBy,
      lockedUntil: { gte: now },
      attempts: claim.attempts,
      version: claim.version,
    },
  });
  if (!row) return null;
  const action: ClaimedAction = {
    ...row,
    lockedBy: claim.lockedBy,
    lockedUntil: row.lockedUntil!,
    scheduledFor: row.scheduledFor ?? row.runAt,
    exhausted: claim.exhausted,
  };
  return { action, now };
}

export function finishAction(
  tx: PrismaTransactionClient,
  input: {
    action: ClaimedAction;
    now: Date;
    result: FailurePlan | { status: 'SUCCEEDED'; lastError: null; runAt: Date };
  },
) {
  const { action, now, result } = input;
  return tx.scheduledAction.update({
    where: { id: action.id, eventId: action.eventId, status: 'RUNNING', version: action.version },
    data: {
      ...result,
      completedAt: result.status === 'PENDING' ? null : now,
      lockedBy: null,
      lockedUntil: null,
      version: { increment: 1 },
      ...(result.status === 'SUCCEEDED' && action.recurrence !== null ? { dedupeKey: null } : {}),
    },
  });
}

/** Release the successful occurrence's key and insert its successor in the same transaction. */
export function enqueueNextOccurrence(
  tx: PrismaTransactionClient,
  input: { action: ClaimedAction; now: Date },
) {
  const { action, now } = input;
  if (action.recurrence === null || action.dedupeKey === null) return;
  const interval = action.recurrence * 1000;
  const periods = Math.max(
    1,
    Math.floor((now.getTime() - action.scheduledFor.getTime()) / interval) + 1,
  );
  const runAt = new Date(action.scheduledFor.getTime() + periods * interval);
  return tx.scheduledAction.create({
    data: {
      eventId: action.eventId,
      type: action.type,
      payload: action.payload === null ? jsonNull : (action.payload as JsonValue),
      runAt,
      scheduledFor: runAt,
      recurrence: action.recurrence,
      dedupeKey: action.dedupeKey,
      maxAttempts: action.maxAttempts,
      createdAt: now,
    },
  });
}
