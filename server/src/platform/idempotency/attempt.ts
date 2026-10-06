import { AsyncLocalStorage } from 'node:async_hooks';
import { ERROR_CODES } from '@spoh/shared';
import { AppError } from '../errors/index.js';
import type { EventScope } from '../db/eventScope.js';
import { systemClock } from '../time/index.js';

export interface ReservationOwner {
  readonly key: string;
  readonly eventId: string;
  readonly endpoint: string;
  readonly actorSub: string;
}

interface ReservationAttempt extends ReservationOwner {
  readonly createdAt: number;
}

const attempts = new AsyncLocalStorage<Readonly<ReservationAttempt>>();

/** The timestamp must be known before an insert or takeover response can stall. */
export function withReservationAttempt<T>(owner: ReservationOwner, operation: () => T): T {
  const attempt = Object.freeze({ ...owner, createdAt: systemClock.now().getTime() });
  return attempts.run(attempt, operation);
}

/** A delayed conflict read must not reclaim a key using its request-start token. */
export function withReservationTakeoverAttempt<T>(
  input: { owner: ReservationOwner; observedCreatedAt: number },
  operation: () => T,
): T {
  const createdAt = Math.max(systemClock.now().getTime(), input.observedCreatedAt + 1);
  return attempts.run(Object.freeze({ ...input.owner, createdAt }), operation);
}

/** A response callback keeps its owner even when another context invokes it. */
export function bindReservationAttempt<T extends (...args: never[]) => unknown>(callback: T): T {
  return AsyncLocalStorage.bind(callback);
}

/** An active HTTP attempt cannot be replaced by a trusted direct-use-case path. */
export function reservationAttempt(key: string, scope?: EventScope) {
  const attempt = attempts.getStore();
  if (attempt && (attempt.key !== key || (scope && attempt.eventId !== scope.eventId)))
    throw reservationUnavailable();
  return attempt;
}

export function ownedReservationWhere(key: string) {
  const attempt = reservationAttempt(key);
  if (!attempt) throw reservationUnavailable();
  return { ...attempt, createdAt: new Date(attempt.createdAt), statusCode: 0 };
}

export function reservationUnavailable(): AppError {
  return new AppError(
    409,
    ERROR_CODES.IDEMPOTENCY_IN_PROGRESS,
    'This request no longer owns its reservation. Retry the same request shortly.',
  );
}
