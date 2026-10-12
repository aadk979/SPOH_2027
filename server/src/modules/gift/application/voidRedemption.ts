import { ERROR_CODES, type VoidGiftRedemptionRequest } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { prisma } from '../../../platform/db/client.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { toGiftTypeRecord } from '../data/mappers.js';
import { findGiftType, lockGiftType } from '../data/repo.js';
import { lockRedemption, lockRedemptionCard, markRedemptionVoid, redemptionReference,
  retainedRedemption, redemptionPoolTotals } from '../data/voidRepo.js';

/** Retain the correction and restore stock only in the redemption's written pool. */
export function voidGiftRedemption(id: string, request: VoidGiftRedemptionRequest,
  actor: ActorContext & { clock?: Clock }) {
  return prisma.$transaction(async (tx) => {
    const { scope } = actor;
    const event = await holdCaptureEvent(tx, scope);
    if (event.status === 'ARCHIVED') throw new ConflictError(ERROR_CODES.CONFLICT, 'Archived records cannot be corrected.');
    await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE "eventId" = ${scope.eventId}
      AND id = ${actor.membershipId} AND "personId" = ${actor.volunteerId} FOR SHARE`;
    await lockReserved(tx, scope, request.idempotencyKey);
    const reference = await redemptionReference(tx, scope, id);
    if (!reference) throw new NotFoundError('Redemption');
    await lockGiftType(tx, scope, reference.giftTypeId);
    await lockRedemptionCard(tx, scope, reference.missionCardId);
    await lockRedemption(tx, scope, id);
    const row = await retainedRedemption(tx, scope, id);
    if (!row || row.giftTypeId !== reference.giftTypeId || row.missionCardId !== reference.missionCardId || row.rehearsal !== reference.rehearsal)
      throw new ConflictError(ERROR_CODES.CONFLICT, 'The redemption changed. Reload and review it.');
    await requireCurrentPermission(tx, { scope, personId: actor.volunteerId, membershipId: actor.membershipId,
      action: 'Record.Void', resource: { type: 'GiftRedemption', id }, clock: actor.clock });
    if (row.voided) throw new ConflictError(ERROR_CODES.CONFLICT, 'This redemption is already voided.');
    const now = (actor.clock ?? systemClock).now();
    await markRedemptionVoid(tx, scope, { id, reason: request.reason, now });
    await writeAudit(tx, { ...actor.audit, action: 'gift.void', entityType: 'GiftRedemption', entityId: id,
      before: { voided: false }, after: { voided: true, reason: request.reason, rehearsal: row.rehearsal } });
    const gift = await findGiftType(scope, row.giftTypeId, tx);
    if (!gift) throw new NotFoundError('Gift type');
    // Card.redeemed derives from non-voided redemptions. LOST/VOIDED and another
    // retained redemption remain authoritative; no card status is rewritten.
    const giftType = toGiftTypeRecord(gift, await redemptionPoolTotals(tx, scope, row));
    const result = { id, voided: true as const, giftType };
    await settleReserved(tx, scope, { key: request.idempotencyKey, statusCode: 200, body: result });
    return result;
  });
}
