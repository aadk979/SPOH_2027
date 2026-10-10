import type { ChangeRolePermissionRequest, RolePermissionsResponse } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { addGrant, hasGrant, lockPermissionEvent, removeGrant } from '../data/repo.js';
import { assertTogglable } from '../domain/permissionRules.js';
import { readRolePermissions } from './readRolePermissions.js';

/**
 * Grant or revoke one Editable action for one role in this event (P11.7). The row and its
 * audit commit together, and the audit publishes on the `access` channel, so every instance's
 * decision cache drops the event's answers and the next request decides with the change.
 * Granting what is granted, or revoking what is not, changes nothing and writes no audit.
 */
export async function changeRolePermission(
  request: ChangeRolePermissionRequest,
  actor: ActorContext,
): Promise<RolePermissionsResponse['data']> {
  const { role, action, granted } = request;
  assertTogglable(role, action);
  return prisma.$transaction(
    async (tx) => {
      await lockPermissionEvent(tx, actor.scope);
      await requireCurrentPermission(tx, {
        scope: actor.scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        action: 'Permissions.Edit',
      });
      const before = await hasGrant(tx, actor.scope, { role, action });
      if (before !== granted) {
        const row = granted
          ? await addGrant(tx, actor.scope, { role, action })
          : await removeGrant(tx, actor.scope, { role, action });
        await writeAudit(tx, {
          ...actor.audit,
          action: 'permissions.change',
          entityType: 'RolePermission',
          entityId: row.id,
          before: { role, action, granted: before },
          after: { role, action, granted },
        });
      }
      return readRolePermissions(actor.scope, { canEdit: true }, tx);
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
