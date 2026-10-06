import { prisma } from '../db/client.js';
import { DEFAULT_SETTINGS } from '../settings/index.js';
import { SYSTEM_AUDIT_CONTEXT } from '../http/auditContext.js';
import { systemClock } from '../time/index.js';
import { pruneReplayInTransaction } from './prune.js';
import { ownedReservationWhere, reservationAttempt, reservationUnavailable } from './attempt.js';

export {
  bindReservationAttempt,
  withReservationAttempt,
  withReservationTakeoverAttempt,
} from './attempt.js';
export { lockReserved, settleReserved } from './transaction.js';

/**
 * Idempotency for every create endpoint (BUILD_PLAN §7.4).
 *
 * This is what makes the client's local write buffer safe. Each capture action
 * generates a UUID before its first send attempt and keeps it across retries,
 * so a tap that times out and is resent produces one row, not two. Without
 * this, the outbox would be a duplicate-count machine.
 *
 * Concurrency matters here as much as replay: a flaky connection can put two
 * copies of the same request in flight at once. A row is therefore RESERVED
 * before the handler runs, using the primary key as the lock:
 *
 *   insert succeeds  -> we own this key, run the handler, store the response
 *   insert conflicts -> someone got here first:
 *                         different endpoint/actor -> 409 key reuse
 *                         still in progress        -> 409 retry shortly
 *                         abandoned (see below)    -> take it over
 *                         finished                 -> replay stored response
 *
 * ── Settling ────────────────────────────────────────────────────────────────
 *
 * The outcome is written back to the reservation BEFORE the response is sent.
 * This used to be fire-and-forget on the grounds that a volunteer should not
 * wait on bookkeeping — but a lost settle leaves an IN_PROGRESS row, and every
 * retry of that capture then gets a 409 until the record is pruned days later.
 * A capture that can never be retried is a worse outcome than one extra
 * millisecond on an indexed primary-key update.
 *
 * The wait is bounded: if the settle has not completed within
 * `SETTLE_TIMEOUT_MS` the response goes out anyway, because a slow bookkeeping
 * write must never hold a booth tap open. Response bookkeeping is conditional
 * on the same unfinished attempt, so it cannot replace a transaction's receipt
 * or a later attempt's outcome.
 *
 * ── Abandoned reservations ──────────────────────────────────────────────────
 *
 * No amount of awaiting helps if the process dies between reserving the key and
 * settling it. So an IN_PROGRESS reservation older than `STALE_RESERVATION_MS`
 * is eligible for takeover by a retry. Age is not proof that the original
 * process died: its database response or handler may merely be slow. The retry
 * replaces the attempt timestamp, and transactional mutations check that fence
 * before effects and completion. A delayed original then receives a 409; its
 * response bookkeeping cannot change or delete the new attempt's receipt.
 */

/** Sentinel status for a reservation whose handler has not finished yet. */
export const IN_PROGRESS = 0;

/**
 * How long before an unsettled reservation may be reclaimed. Ownership checks,
 * rather than an assumed request-duration ceiling, fence the old attempt.
 */
const STALE_RESERVATION_MS = 60_000;

export interface Reservation {
  eventId: string | null;
  endpoint: string;
  actorSub: string;
  statusCode: number;
  responseBody: unknown;
  createdAt: Date;
}

/**
 * Claim the key. Returns `null` when the claim succeeded (we own it), or the
 * existing record when someone else already holds it.
 */
export async function reserve(
  key: string,
  owner: { endpoint: string; actorSub: string; eventId: string },
): Promise<Reservation | null> {
  const attempt = reservationAttempt(key, { eventId: owner.eventId });
  if (attempt && (attempt.endpoint !== owner.endpoint || attempt.actorSub !== owner.actorSub))
    throw reservationUnavailable();
  try {
    await prisma.idempotencyRecord.create({
      data: {
        key,
        ...owner,
        statusCode: IN_PROGRESS,
        responseBody: {},
        createdAt: attempt ? new Date(attempt.createdAt) : systemClock.now(),
      },
    });
    return null;
  } catch {
    // Unique violation on the primary key — someone else holds this key. Any
    // other failure also lands here and is surfaced by the follow-up read.
    const record = await prisma.idempotencyRecord.findUnique({ where: { key } });
    if (!record) throw new Error(`idempotency key ${key} could neither be created nor read`);
    return record;
  }
}

/** An unsettled reservation old enough that its process must have died. */
export function isAbandoned(reservation: Reservation, now: number = Date.now()): boolean {
  return now - reservation.createdAt.getTime() > STALE_RESERVATION_MS;
}

/**
 * Take an abandoned reservation over. Conditional, so that of several retries
 * racing here only the one whose update still sees the stale reservation wins;
 * each of them used to run the handler (F03-011).
 */
export async function takeOver(key: string, reservation: Reservation): Promise<boolean> {
  const attempt = reservationAttempt(key);
  if (
    attempt &&
    (attempt.eventId !== reservation.eventId ||
      attempt.endpoint !== reservation.endpoint ||
      attempt.actorSub !== reservation.actorSub)
  )
    throw reservationUnavailable();
  const createdAt =
    attempt?.createdAt ??
    Math.max(systemClock.now().getTime(), reservation.createdAt.getTime() + 1);
  if (createdAt <= reservation.createdAt.getTime()) throw reservationUnavailable();
  const { count } = await prisma.idempotencyRecord.updateMany({
    where: {
      key,
      statusCode: IN_PROGRESS,
      createdAt: reservation.createdAt,
      eventId: reservation.eventId,
      endpoint: reservation.endpoint,
      actorSub: reservation.actorSub,
    },
    data: { createdAt: new Date(createdAt) },
  });
  return count === 1;
}

/** Store a successful response for replay. */
export async function settle(key: string, statusCode: number, body: object): Promise<void> {
  await prisma.idempotencyRecord.updateMany({
    where: ownedReservationWhere(key),
    data: { statusCode, responseBody: body },
  });
}

/** Release the key, so a genuine retry of a failed attempt is not blocked. */
export async function release(key: string): Promise<void> {
  await prisma.idempotencyRecord.deleteMany({ where: ownedReservationWhere(key) });
}

/** Records older than this are pruned by the daily job (BUILD_PLAN §7.4). */
export const IDEMPOTENCY_RETENTION_DAYS = DEFAULT_SETTINGS.idempotencyRetentionDays;

export async function pruneIdempotencyRecords(now: Date = systemClock.now()): Promise<number> {
  return prisma.$transaction((tx) =>
    pruneReplayInTransaction(tx, { now, audit: SYSTEM_AUDIT_CONTEXT }),
  );
}
