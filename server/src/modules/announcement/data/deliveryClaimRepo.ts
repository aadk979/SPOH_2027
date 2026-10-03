import type { PrismaTransactionClient } from '../../../platform/db/client.js';

export interface ClaimedDelivery {
  readonly id: string;
  readonly eventId: string;
  readonly version: number;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lockedBy: string;
  readonly lockedUntil: Date;
  readonly exhausted: boolean;
}

export async function claimRows(
  tx: PrismaTransactionClient,
  input: { workerId: string; now: Date; leaseUntil: Date },
) {
  return tx.$queryRaw<ClaimedDelivery[]>`
    WITH due AS (
      SELECT id, attempts >= "maxAttempts" AS exhausted FROM "AnnouncementPushDelivery"
       WHERE (status = 'PENDING' AND "runAt" <= ${input.now})
          OR (status = 'RUNNING' AND "lockedUntil" < ${input.now})
       ORDER BY "runAt", id FOR UPDATE SKIP LOCKED LIMIT 5
    )
    UPDATE "AnnouncementPushDelivery" AS delivery
       SET status = 'RUNNING', "lockedBy" = ${input.workerId}, "lockedUntil" = ${input.leaseUntil},
           attempts = LEAST(attempts + 1, "maxAttempts"), version = version + 1
      FROM due WHERE delivery.id = due.id
    RETURNING delivery.id, delivery."eventId", delivery.version, delivery.attempts,
              delivery."maxAttempts", delivery."lockedBy", delivery."lockedUntil", due.exhausted
  `;
}
