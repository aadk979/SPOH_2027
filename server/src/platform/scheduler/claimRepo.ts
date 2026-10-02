import type { PrismaTransactionClient } from '../db/client.js';

/** The immutable claim token fences late workers, even when their instance ID is reused. */
export interface ClaimedAction {
  readonly id: string;
  readonly eventId: string | null;
  readonly type: string;
  readonly payload: unknown;
  readonly runAt: Date;
  readonly scheduledFor: Date;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lockedBy: string;
  readonly lockedUntil: Date;
  readonly recurrence: number | null;
  readonly dedupeKey: string | null;
  readonly version: number;
  readonly createdByPersonId: string | null;
  /** A crashed final attempt must be dead-lettered without executing its handler again. */
  readonly exhausted: boolean;
}

export interface ClaimInput {
  readonly workerId: string;
  readonly types: readonly string[];
  readonly now: Date;
  readonly leaseUntil: Date;
}

/** Claim only registered types; an incomplete deployment must not consume another handler's work. */
export async function claimActions(tx: PrismaTransactionClient, input: ClaimInput) {
  return tx.$queryRaw<ClaimedAction[]>`
    WITH due AS (
      SELECT id, attempts >= "maxAttempts" AS exhausted FROM "ScheduledAction"
       WHERE "type" IN (SELECT jsonb_array_elements_text(${JSON.stringify(input.types)}::jsonb))
         AND ((status = 'PENDING' AND "runAt" <= ${input.now})
           OR (status = 'RUNNING' AND "lockedUntil" < ${input.now}))
       ORDER BY "runAt", id
       FOR UPDATE SKIP LOCKED LIMIT 5
    )
    UPDATE "ScheduledAction" AS action
       SET status = 'RUNNING', "lockedBy" = ${input.workerId}, "lockedUntil" = ${input.leaseUntil},
           "scheduledFor" = COALESCE(action."scheduledFor", action."runAt"),
           attempts = LEAST(attempts + 1, "maxAttempts"), version = version + 1
      FROM due WHERE action.id = due.id
    RETURNING action.id, action."eventId", action.type, action.payload, action."runAt", action."scheduledFor",
              action.attempts, action."maxAttempts", action."lockedBy", action."lockedUntil",
              action.recurrence, action."dedupeKey", action.version, action."createdByPersonId", due.exhausted
  `;
}
