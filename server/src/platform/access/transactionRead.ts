import { prisma } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { holdCaptureEvent } from '../db/captureProvenance.js';
import { createReadContext, type ReadContext } from './currentRead.js';

/** Hold caller standing and one snapshot across current-policy checks and every count/row projection. */
export function withCurrentRead<T>(input: { scope: EventScope; personId: string;
  membershipId?: string; now: Date; ip?: string | null }, read: (context: ReadContext) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (db) => {
    await holdCaptureEvent(db, input.scope);
    await db.$queryRaw`SELECT id FROM "Person" WHERE id = ${input.personId} FOR SHARE`;
    await db.$queryRaw`SELECT id FROM "EventMembership" WHERE "eventId" = ${input.scope.eventId}
      AND id = ${input.membershipId ?? ''} AND "personId" = ${input.personId} FOR SHARE`;
    await db.$queryRaw`SELECT id FROM "ShiftAssignment" WHERE "eventId" = ${input.scope.eventId}
      AND "volunteerId" = ${input.personId} ORDER BY id FOR SHARE`;
    return read(createReadContext({ ...input, db }));
  }, { timeout: 30_000, isolationLevel: 'RepeatableRead' });
}
