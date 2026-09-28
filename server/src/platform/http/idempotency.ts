import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ERROR_CODES } from '@spoh/shared';
import { AppError, IdempotencyKeyReuseError, ValidationError } from '../errors/index.js';
import {
  IN_PROGRESS,
  isAbandoned,
  release,
  reserve,
  settle,
  takeOver,
  type Reservation,
} from '../idempotency/index.js';
import { logger } from '../logger/index.js';
import { named } from './named.js';
import { getAuth } from './requireAuth.js';

/**
 * The idempotency middleware for every create endpoint (BUILD_PLAN §7.4): the
 * reservation, replay and settle protocol described in platform/idempotency,
 * applied to a request.
 */

/** How long the response waits for its own bookkeeping before going out anyway. */
const SETTLE_TIMEOUT_MS = 2_000;

interface IdempotentBody {
  idempotencyKey?: unknown;
}

/**
 * For an endpoint whose response carries personal data (F04-013, ADR-003 §8).
 *
 * The stored response outlives the row it describes: records are kept for
 * `idempotencyRetentionDays`, and a purge that nulls a lost-person description
 * cannot reach a copy of it in this table. Such an endpoint stores only what
 * `store` returns (the created id), and a replay rebuilds the response from
 * the row as it is now, after any purge.
 */
export interface RedactedReplay {
  store(body: unknown): object;
  replay(req: Request, stored: unknown): Promise<unknown>;
}

interface IdempotentOptions {
  redacted?: RedactedReplay;
}

export function idempotent(endpointName: string, options: IdempotentOptions = {}): RequestHandler {
  return named(`idempotent(${endpointName})`, idempotencyMiddleware(endpointName, options));
}

interface KeyContext {
  req: Request;
  res: Response;
  key: string;
  endpointName: string;
  options: IdempotentOptions;
}

/**
 * A reservation whose process never finished: take it over rather than leave
 * the capture permanently unretryable. Conditional, so that of several retries
 * racing here only the one whose update still sees the stale reservation wins;
 * each of them used to run the handler (F03-011).
 */
async function takeOverAbandoned(ctx: KeyContext, existing: Reservation): Promise<boolean> {
  logger.warn(
    { requestId: ctx.req.id, endpoint: ctx.endpointName, key: ctx.key },
    'taking over an abandoned idempotency reservation',
  );
  return takeOver(ctx.key, existing);
}

/**
 * Someone already holds this key. Returns the error to answer with, `'replayed'`
 * once the stored response has been sent, or null when this request took over
 * an abandoned reservation and should run the handler.
 */
async function resolveExisting(
  ctx: KeyContext,
  existing: Reservation,
  actorSub: string,
): Promise<AppError | 'replayed' | null> {
  if (existing.endpoint !== ctx.endpointName || existing.actorSub !== actorSub) {
    return new IdempotencyKeyReuseError();
  }
  if (existing.statusCode !== IN_PROGRESS) {
    logger.debug({ requestId: ctx.req.id, endpoint: ctx.endpointName }, 'idempotent replay');
    ctx.res.status(existing.statusCode).json(await replayBody(ctx.req, existing, ctx.options));
    return 'replayed';
  }
  if (isAbandoned(existing) && (await takeOverAbandoned(ctx, existing))) return null;
  return inProgress();
}

function idempotencyMiddleware(endpointName: string, options: IdempotentOptions): RequestHandler {
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
        const ctx: KeyContext = { req, res, key, endpointName, options };
        const outcome = existing ? await resolveExisting(ctx, existing, auth.sub) : null;
        if (outcome === 'replayed') return;
        if (outcome) {
          next(outcome);
          return;
        }

        captureResponse(req, res, { key, redacted: options.redacted });
        next();
      } catch (error) {
        next(error);
      }
    })();
  };
}

function inProgress(): AppError {
  return new AppError(
    409,
    ERROR_CODES.IDEMPOTENCY_IN_PROGRESS,
    'An identical request is already being processed. Retry shortly.',
  );
}

/** The stored response, or for a redacted endpoint the response rebuilt from the row. */
async function replayBody(
  req: Request,
  existing: Reservation,
  { redacted }: IdempotentOptions,
): Promise<unknown> {
  return redacted ? redacted.replay(req, existing.responseBody) : existing.responseBody;
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
function captureResponse(
  req: Request,
  res: Response,
  { key, redacted }: { key: string; redacted: RedactedReplay | undefined },
): void {
  const originalJson = res.json.bind(res);

  res.json = (body: unknown): Response => {
    const statusCode = res.statusCode;

    const outcome =
      statusCode >= 200 && statusCode < 300
        ? settle(key, statusCode, redacted ? redacted.store(body) : (body as object))
        : release(key);

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
      outcome.then(
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
