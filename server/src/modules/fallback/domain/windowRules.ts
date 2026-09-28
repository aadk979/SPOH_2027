import { ERROR_CODES } from '@spoh/shared';
import { AppError } from '../../../platform/errors/index.js';

/**
 * Fallback windows and reconciliation (PRODUCT_BRIEF §11).
 *
 * Two rules govern everything here.
 *
 * **Declaring a tier is a command decision.** Only a Deputy Coordinator or the
 * Chief may declare or close one. Individual volunteers deciding to switch
 * systems is how the same visitor ends up counted in three places.
 *
 * **Never silently blend sources.** Every imported record is tagged
 * FALLBACK_SHEET or PAPER, keeps its original timestamp where one was recorded
 * and a coarse time block where it was not, and every summary that overlaps a
 * window says so. A report that quietly mixes app data and paper estimates is
 * worse than one that says which hour is approximate.
 */

/**
 * One open window per scope. A second declaration for the same station would
 * make "was this hour degraded" ambiguous, which is the one question the window
 * exists to answer.
 */
export function assertNoOpenWindow(open: unknown, stationId: string | null): void {
  if (open) {
    throw new AppError(
      409,
      ERROR_CODES.FALLBACK_ALREADY_OPEN,
      stationId
        ? 'A fallback window is already open for that station'
        : 'An event-wide fallback window is already open',
    );
  }
}

export function assertWindowOpen(window: { endedAt: Date | null }): void {
  if (window.endedAt) {
    throw new AppError(
      409,
      ERROR_CODES.FALLBACK_ALREADY_CLOSED,
      'That fallback window is already closed',
    );
  }
}

export function assertEndsAfterStart(window: { startedAt: Date }, endedAt: Date): void {
  if (endedAt < window.startedAt) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_FAILED,
      'A fallback window cannot end before it started',
    );
  }
}
