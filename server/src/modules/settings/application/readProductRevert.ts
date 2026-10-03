import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import type { EventSettingRevertReceipt } from '../domain/revertReceipt.js';
import { productRevertResponse } from './productRevertResponse.js';

export function readProductRevert(receipt: EventSettingRevertReceipt, actor: ActorContext) {
  return prisma.$transaction(
    async (tx) => {
      await holdCaptureEvent(tx, actor.scope);
      await requireCurrentCapability(tx, {
        scope: actor.scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        capability: 'config.manage',
      });
      return productRevertResponse(tx, { actor, receipt });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
