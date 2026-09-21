import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ERROR_CODES } from '@spoh/shared';
import { AppError, IdempotencyKeyReuseError, ValidationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { getSettings, DEFAULT_SETTINGS } from '../lib/settings.js';
import { getAuth } from './auth/index.js';

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
 * write must never hold a booth tap open. The abandoned-reservation takeover
 * below is what makes that safe.
 *
 * ── Abandoned reservations ──────────────────────────────────────────────────
 *
 * No amount of awaiting helps if the process dies between reserving the key and
 * settling it. So an IN_PROGRESS reservation older than `STALE_RESERVATION_MS`
 * is treated as abandoned and taken over by the retry. The window is comfortably
 * longer than any real request, so a genuine in-flight duplicate still gets a
 * 409 rather than racing.
 */

/** Sentinel status for a reservation whose handler has not finished yet. */
const IN_PROGRESS = 0;

/** How long the response waits for its own bookkeeping before going out anyway. */
const SETTLE_TIMEOUT_MS = 2_000;

/**
 * How long before an unsettled reservation is assumed to belong to a process
 * that died. Longer than the API's slowest write by a wide margin.
 */
const STALE_RESERVATION_MS = 60_000;

interface IdempotentBody {
  idempotencyKey?: unknown;
}

interface Reservation {
  endpoint: string;
  actorSub: string;
  statusCode: number;
  responseBody: unknown;
  createdAt: Date;
}

export function idempotent(endpointName: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        const auth = getAuth(req);
        const key = (req.body as IdempotentBody | undefined)?.idempotencyKey;

        if (typeof key !== 'string' || key.length === 0) {
          next(new ValidationError('idempotencyKey is required'));
          return;
        }

        const existing = await reserve(key, endpointName, auth.sub);

        if (existing) {
          if (existing.endpoint !== endpointName || existing.actorSub !== auth.sub) {
            next(new IdempotencyKeyReuseError());
            return;
          }

          if (existing.statusCode === IN_PROGRESS) {
            const abandoned = Date.now() - existing.createdAt.getTime() > STALE_RESERVATION_MS;

            if (!abandoned) {
              next(
                new AppError(
                  409,
                  ERROR_CODES.IDEMPOTENCY_IN_PROGRESS,
                  'An identical request is already being processed. Retry shortly.',
                ),
              );
              return;
            }

            // The process that claimed this key never finished. Take it over
            // rather than leaving the capture permanently unretryable.
            logger.warn(
              { requestId: req.id, endpoint: endpointName, key },
              'taking over an abandoned idempotency reservation',
            );
            await prisma.idempotencyRecord.update({
              where: { key },
              data: { createdAt: new Date() },
            });
          } else {
            logger.debug({ requestId: req.id, endpoint: endpointName }, 'idempotent replay');
            res.status(existing.statusCode).json(existing.responseBody);
            return;
          }
        }

        captureResponse(req, res, key);
        next();
      } catch (error) {
        next(error);
      }
    })();
  };
}

/**
 * Claim the key. Returns `null` when the claim succeeded (we own it), or the
 * existing record when someone else already holds it.
 */
async function reserve(
  key: string,
  endpoint: string,
  actorSub: string,
): Promise<Reservation | null> {
  try {
    await prisma.idempotencyRecord.create({
      data: { key, endpoint, actorSub, statusCode: IN_PROGRESS, responseBody: {} },
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

/**
 * Wrap `res.json` so the outcome is written back to the reservation before the
 * body reaches the client. Successful responses are stored for replay; failures
 * release the key so a genuine retry is not blocked by a failed attempt.
 *
 * The override returns `res` synchronously to satisfy Express's signature, and
 * defers the actual send until the settle resolves or times out. The handler has
 * already returned by then and nothing else writes to this response.
 */
function captureResponse(req: Request, res: Response, key: string): void {
  const originalJson = res.json.bind(res);

  res.json = (body: unknown): Response => {
    const statusCode = res.statusCode;

    const settle =
      statusCode >= 200 && statusCode < 300
        ? prisma.idempotencyRecord.update({
            where: { key },
            data: { statusCode, responseBody: body as object },
          })
        : prisma.idempotencyRecord.delete({ where: { key } });

    const send = (): void => {
      // The client may have hung up while we were settling.
      if (!res.writableEnded) originalJson(body);
    };

    // Bounded wait. A slow settle must not hold the tap open; the abandoned
    // reservation takeover covers the case where it never lands at all.
    const timeout = new Promise<void>((resolve) => {
      setTimeout(resolve, SETTLE_TIMEOUT_MS).unref();
    });

    void Promise.race([
      settle.then(
        () => undefined,
        (error: unknown) => {
          logger.error(
            { err: error, requestId: req.id, key },
            'failed to settle idempotency record',
          );
        },
      ),
      timeout,
    ]).finally(send);

    return res;
  };
}

/** Records older than this are pruned by the daily job (BUILD_PLAN §7.4). */
export const IDEMPOTENCY_RETENTION_DAYS = DEFAULT_SETTINGS.idempotencyRetentionDays;

export async function pruneIdempotencyRecords(now: Date = new Date()): Promise<number> {
  const days = getSettings().idempotencyRetentionDays;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const { count } = await prisma.idempotencyRecord.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}
