import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ERROR_CODES } from '@spoh/shared';
import { AppError, IdempotencyKeyReuseError, ValidationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
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
 *                         finished                 -> replay stored response
 *
 * A reservation whose handler failed is deleted, so a genuine retry after an
 * error is not permanently blocked by the failed attempt.
 */

/** Sentinel status for a reservation whose handler has not finished yet. */
const IN_PROGRESS = 0;

interface IdempotentBody {
  idempotencyKey?: unknown;
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
            next(
              new AppError(
                409,
                ERROR_CODES.IDEMPOTENCY_IN_PROGRESS,
                'An identical request is already being processed. Retry shortly.',
              ),
            );
            return;
          }

          logger.debug({ requestId: req.id, endpoint: endpointName }, 'idempotent replay');
          res.status(existing.statusCode).json(existing.responseBody);
          return;
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
): Promise<{
  endpoint: string;
  actorSub: string;
  statusCode: number;
  responseBody: unknown;
} | null> {
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
 * Wrap `res.json` so the outcome is written back to the reservation. Successful
 * responses are stored for replay; failures release the key.
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

    // Not awaited: the volunteer's response must not wait on bookkeeping. A
    // lost settle leaves an in-progress row that expires with the daily prune,
    // and the client's retry gets a clean 409 rather than a duplicate row.
    void settle.catch((error: unknown) => {
      logger.error({ err: error, requestId: req.id, key }, 'failed to settle idempotency record');
    });

    return originalJson(body);
  };
}

/** Records older than this are pruned by the daily job (BUILD_PLAN §7.4). */
export const IDEMPOTENCY_RETENTION_DAYS = 7;

export async function pruneIdempotencyRecords(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - IDEMPOTENCY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.idempotencyRecord.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}
