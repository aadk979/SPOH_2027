import { ERROR_CODES, type EventStatus } from '@spoh/shared';
import type { PrismaTransactionClient } from './client.js';
import type { EventScope } from './eventScope.js';
import { ConflictError, NotFoundError } from '../errors/index.js';

export interface CaptureProvenance {
  rehearsal: boolean;
}

/** Capture-screen counts use the written row's mode, even if the event changes afterwards. */
export type CaptureModeScope = EventScope & CaptureProvenance;

export interface CaptureEvent {
  status: EventStatus;
  closedAt: Date | null;
  organisationId: string;
}

/** Keep phase and close time stable until the caller's transaction commits. */
export async function holdCaptureEvent(
  tx: PrismaTransactionClient,
  scope: EventScope,
): Promise<CaptureEvent> {
  const rows = await tx.$queryRaw<CaptureEvent[]>`
    SELECT status, "closedAt", "organisationId" FROM "Event" WHERE id = ${scope.eventId} FOR SHARE`;
  const event = rows[0];
  if (!event) throw new NotFoundError('Event');
  return event;
}

export function assertCaptureMode(rehearsal: boolean, expected?: { rehearsal?: boolean }): void {
  if (expected?.rehearsal !== undefined && expected.rehearsal !== rehearsal) {
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'The event changed rehearsal/live mode. This capture was not recorded.',
    );
  }
}

/** Preparation and reads need provenance without admitting a new capture. */
export async function captureProvenance(
  tx: PrismaTransactionClient,
  scope: EventScope,
  expected?: { rehearsal?: boolean },
): Promise<CaptureProvenance> {
  const event = await holdCaptureEvent(tx, scope);
  const rehearsal = event.status === 'REHEARSAL';
  assertCaptureMode(rehearsal, expected);
  return { rehearsal };
}
