import { ERROR_CODES, type ConfirmOutboxSalvageRequest } from '@spoh/shared';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { createReadContext } from '../../../platform/access/currentRead.js';
import { requireSelfRead } from '../../../platform/workspace/sourceRead.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { ConflictError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { retainedSalvageCapture } from '../data/salvageRepo.js';

/** Confirmation proves retained capture ownership; counts alone cannot authorize local deletion. */
export function confirmOutboxSalvage(request: ConfirmOutboxSalvageRequest, actor: ActorContext & { clock?: Clock }) {
  return prisma.$transaction(async (tx) => {
    const { scope } = actor;
    await holdCaptureEvent(tx, scope);
    await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE "eventId" = ${scope.eventId}
      AND id = ${actor.membershipId} AND "personId" = ${actor.volunteerId} FOR SHARE`;
    const context = createReadContext({ scope, db: tx, personId: actor.volunteerId, membershipId: actor.membershipId,
      now: (actor.clock ?? systemClock).now() });
    await requireSelfRead(context);
    await lockReserved(tx, scope, request.idempotencyKey);
    for (const entry of request.entries) {
      const retained = await retainedSalvageCapture(scope, { db: tx, personId: actor.volunteerId, entry });
      if (!retained) throw new ConflictError(ERROR_CODES.CONFLICT, 'A selected capture is not confirmed for this person and event. Keep it in the queue.');
    }
    const confirmedKeys = request.entries.map((entry) => entry.idempotencyKey);
    const auditId = randomUUID();
    await writeAudit(tx, { ...actor.audit, id: auditId, action: 'outbox.salvage.confirm', entityType: 'OutboxRecovery', entityId: null,
      after: { reason: request.reason, entries: request.entries } });
    const result = { eventId: scope.eventId, personId: actor.volunteerId, auditId, confirmedKeys };
    await settleReserved(tx, scope, { key: request.idempotencyKey, statusCode: 200, body: result });
    return result;
  });
}
