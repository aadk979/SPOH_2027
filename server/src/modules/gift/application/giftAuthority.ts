import { ERROR_CODES } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { ConflictError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';

export async function requireGiftAuthority(
  tx: PrismaTransactionClient,
  actor: ActorContext,
  action: 'Structure.Edit' | 'Structure.Change',
): Promise<void> {
  const event = await holdCaptureEvent(tx, actor.scope);
  if (
    event.status === 'ARCHIVED' ||
    (action === 'Structure.Change' && !['DRAFT', 'READY', 'REHEARSAL'].includes(event.status))
  )
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Gift structure is frozen at this event stage.');
  await requireCurrentPermission(tx, {
    scope: actor.scope,
    personId: actor.volunteerId,
    membershipId: actor.membershipId,
    action,
  });
}
