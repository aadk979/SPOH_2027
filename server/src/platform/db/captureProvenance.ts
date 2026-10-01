import { ERROR_CODES, type EventStatus } from '@spoh/shared';
import type { PrismaTransactionClient } from './client.js';
import type { EventScope } from './eventScope.js';
import { ConflictError, NotFoundError } from '../errors/index.js';

export interface CaptureProvenance {
  rehearsal: boolean;
}

/** Keep the event phase stable until the capture transaction commits. */
export async function captureProvenance(
  tx: PrismaTransactionClient,
  scope: EventScope,
  expected?: { rehearsal?: boolean },
): Promise<CaptureProvenance> {
  const rows = await tx.$queryRaw<Array<{ status: EventStatus }>>`
    SELECT status FROM "Event" WHERE id = ${scope.eventId} FOR SHARE`;
  const event = rows[0];
  if (!event) throw new NotFoundError('Event');
  const rehearsal = event.status === 'REHEARSAL';
  if (expected?.rehearsal !== undefined && expected.rehearsal !== rehearsal) {
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'The event changed rehearsal/live mode. This capture was not recorded.',
    );
  }
  return { rehearsal };
}
