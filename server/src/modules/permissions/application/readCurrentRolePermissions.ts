import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { prisma } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { lockPermissionEvent } from '../data/repo.js';
import { readRolePermissions } from './readRolePermissions.js';

/** Review retries describe current evidence and recheck authority, instead of replaying a stale pass. */
export function readCurrentRolePermissions(actor: ActorContext) {
  return prisma.$transaction(async (tx) => {
    const event = await lockPermissionEvent(tx, actor.scope);
    await requireCurrentPermission(tx, {
      scope: actor.scope,
      membershipId: actor.membershipId,
      personId: actor.volunteerId,
      action: 'Permissions.Edit',
    });
    return readRolePermissions(actor.scope, { canEdit: event.status !== 'ARCHIVED' }, tx);
  });
}
