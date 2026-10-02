import { AppError } from '../errors/index.js';
import type { ClaimedAction } from './claimRepo.js';

export type RefusalCode =
  | 'INVALID_PAYLOAD'
  | 'AUTHORITY_CHANGED'
  | 'GUARD_FAILED'
  | 'TOO_LATE'
  | 'TARGET_MISSING'
  | 'SYSTEM_ONLY'
  | 'HANDLER_UNAVAILABLE';

/** Only bounded catalogue codes reach lastError; raw exceptions can contain SQL or personal data. */
export class ScheduleRefusal extends Error {
  constructor(readonly code: RefusalCode) {
    super(code);
  }
}

export class ExhaustedLease extends Error {}

export interface FailurePlan {
  status: 'PENDING' | 'FAILED' | 'DEAD';
  lastError: RefusalCode | 'EXECUTION_FAILED' | 'ATTEMPTS_EXHAUSTED';
  runAt: Date;
}

function refusalCode(error: unknown): RefusalCode | undefined {
  if (error instanceof ScheduleRefusal) return error.code;
  if (!(error instanceof AppError) || error.statusCode >= 500) return undefined;
  if (error.statusCode === 401 || error.statusCode === 403) return 'AUTHORITY_CHANGED';
  if (error.statusCode === 404) return 'TARGET_MISSING';
  if (error.statusCode === 400) return 'INVALID_PAYLOAD';
  return 'GUARD_FAILED';
}

/** Retry timings and maximum-attempt handling are the ADR-004 protocol, not wall-clock guesses. */
export function planFailure(
  error: unknown,
  input: { action: ClaimedAction; now: Date },
): FailurePlan {
  const { action, now } = input;
  if (error instanceof ExhaustedLease) {
    return { status: 'DEAD', lastError: 'ATTEMPTS_EXHAUSTED', runAt: action.runAt };
  }
  const refused = refusalCode(error);
  if (refused) return { status: 'FAILED', lastError: refused, runAt: action.runAt };
  if (action.attempts >= action.maxAttempts) {
    return { status: 'DEAD', lastError: 'EXECUTION_FAILED', runAt: action.runAt };
  }
  const backoffSeconds = [30, 120, 600, 1800];
  const seconds = backoffSeconds[Math.min(action.attempts - 1, backoffSeconds.length - 1)]!;
  return {
    status: 'PENDING',
    lastError: 'EXECUTION_FAILED',
    runAt: new Date(now.getTime() + seconds * 1000),
  };
}
