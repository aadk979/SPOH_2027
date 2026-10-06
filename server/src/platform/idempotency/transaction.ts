import type { PrismaTransactionClient } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { reservationAttempt, reservationUnavailable } from './attempt.js';

interface LockedReservation {
  key: string;
  eventId: string;
  endpoint: string;
  actorSub: string;
  statusCode: number;
  createdAt: Date;
}

async function holdReservation(
  tx: Pick<PrismaTransactionClient, '$queryRaw'>,
  scope: EventScope,
  key: string,
): Promise<LockedReservation> {
  const attempt = reservationAttempt(key, scope);
  const [row] = await tx.$queryRaw<LockedReservation[]>`SELECT key, "eventId", endpoint,
    "actorSub", "statusCode", "createdAt" FROM "IdempotencyRecord"
    WHERE key = ${key} AND "eventId" = ${scope.eventId} FOR UPDATE`;
  if (!row || row.statusCode !== 0) throw reservationUnavailable();
  if (
    attempt &&
    (row.endpoint !== attempt.endpoint ||
      row.actorSub !== attempt.actorSub ||
      row.createdAt.getTime() !== attempt.createdAt)
  )
    throw reservationUnavailable();
  return row;
}

/** Reject a lost reservation before any effect, while retaining the row lock. */
export async function lockReserved(
  tx: Pick<PrismaTransactionClient, '$queryRaw'>,
  scope: EventScope,
  key: string,
): Promise<void> {
  await holdReservation(tx, scope, key);
}

/** A failed fence throws inside the effect transaction, rolling all its writes back. */
export async function settleReserved(
  tx: PrismaTransactionClient,
  scope: EventScope,
  result: { key: string; statusCode: number; body: object },
): Promise<void> {
  const row = await holdReservation(tx, scope, result.key);
  const { count } = await tx.idempotencyRecord.updateMany({
    where: {
      key: result.key,
      eventId: scope.eventId,
      statusCode: 0,
      createdAt: row.createdAt,
      endpoint: row.endpoint,
      actorSub: row.actorSub,
    },
    data: { statusCode: result.statusCode, responseBody: result.body },
  });
  if (count !== 1) throw reservationUnavailable();
}
