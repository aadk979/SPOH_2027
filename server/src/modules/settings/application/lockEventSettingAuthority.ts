import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { lockVisitorEvent } from '../../visitor/index.js';

/** Event policy/purge lock comes before the current membership lock, for every writer. */
export async function lockEventSettingAuthority(tx: PrismaTransactionClient, actor: ActorContext) {
  await lockVisitorEvent(tx, actor.scope);
  await requireCurrentCapability(tx, {
    scope: actor.scope,
    membershipId: actor.membershipId,
    personId: actor.volunteerId,
    capability: 'config.manage',
  });
}
