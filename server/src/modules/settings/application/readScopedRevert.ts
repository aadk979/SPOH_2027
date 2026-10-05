import type { ScopedSettingsRevertRequest } from '@spoh/shared';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { prisma } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import type { Clock } from '../../../platform/time/index.js';
import type { ScopedRevertReceipt } from '../domain/scopedRevertReceipt.js';
import { scopedRevertResponse } from './scopedRevertResponse.js';

/** Successful restore retries recheck current authority, including read-only archived history. */
export function readScopedRevert(
  receipt: ScopedRevertReceipt,
  request: ScopedSettingsRevertRequest,
  actor: ActorContext & { clock?: Clock },
) {
  return prisma.$transaction(
    async (tx) => {
      const event = await holdCaptureEvent(tx, actor.scope);
      await requireCurrentCapability(tx, {
        scope: actor.scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        capability: 'config.manage',
      });
      return scopedRevertResponse(tx, { receipt, request, actor, event });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
