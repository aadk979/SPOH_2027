import type { ScopedSettingsMutationRequest } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { prisma } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import type { Clock } from '../../../platform/time/index.js';
import type { ScopedMutationReceipt } from '../domain/scopedMutationReceipt.js';
import { scopedMutationResponse } from './scopedMutationResponse.js';

/** A successful retry is a current-authority read, including after event archive. */
export function readScopedMutation(
  receipt: ScopedMutationReceipt,
  request: ScopedSettingsMutationRequest,
  actor: ActorContext & { clock?: Clock },
) {
  return prisma.$transaction(
    async (tx) => {
      const event = await holdCaptureEvent(tx, actor.scope);
      await requireCurrentPermission(tx, {
        scope: actor.scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        action: 'Settings.Read',
      });
      return scopedMutationResponse(tx, { receipt, request, actor, event });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
