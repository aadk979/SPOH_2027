import { ERROR_CODES, type IncidentStatus } from '@spoh/shared';
import { AppError } from '../../../platform/errors/index.js';

/**
 * The incident state machine (ADR-002 §2, F03-024): OPEN → ACKNOWLEDGED →
 * RESOLVED, and a resolved incident is reopened only with a note saying why.
 * Anything else, a move to the status it already has included, is refused, so
 * the "incidents open" count never goes back up without a recorded reason.
 */
const ALLOWED: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> = {
  OPEN: ['ACKNOWLEDGED', 'RESOLVED'],
  ACKNOWLEDGED: ['RESOLVED'],
  RESOLVED: ['OPEN'],
};

/** Moves that are allowed only with a note in the incident's log. */
const NEEDS_NOTE: ReadonlySet<string> = new Set(['RESOLVED>OPEN']);

export function assertIncidentTransition(
  from: IncidentStatus,
  to: IncidentStatus,
  note: string | undefined,
): void {
  if (!ALLOWED[from].includes(to)) {
    throw new AppError(
      409,
      ERROR_CODES.INVALID_TRANSITION,
      `An incident cannot move from ${from} to ${to}.`,
    );
  }
  if (NEEDS_NOTE.has(`${from}>${to}`) && !note?.trim()) {
    throw new AppError(
      409,
      ERROR_CODES.INVALID_TRANSITION,
      'Reopening a resolved incident needs a note saying why.',
    );
  }
}
