import type { ScopedSettingsReadQuery } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import type { Clock } from '../../../platform/time/index.js';
import { scopedReadResponse } from './scopedReadResponse.js';

export function readScopedSettings(
  query: ScopedSettingsReadQuery,
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
      return scopedReadResponse(tx, { query, actor, event });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
