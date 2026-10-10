import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { settingQuestion } from '../../../platform/access/settingQuestion.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { lockVisitorEvent } from '../../visitor/index.js';

/**
 * Event policy/purge lock comes before the current membership lock, for every writer. A change
 * to one setting asks what its route asked (the setting's class); a capture schedule, which
 * names no single change yet, asks `Schedule.Manage`.
 */
export async function lockEventSettingAuthority(
  tx: PrismaTransactionClient,
  actor: ActorContext,
  key?: string,
) {
  await lockVisitorEvent(tx, actor.scope);
  await requireCurrentPermission(tx, {
    scope: actor.scope,
    membershipId: actor.membershipId,
    personId: actor.volunteerId,
    ...(key === undefined ? { action: 'Schedule.Manage' } : settingQuestion(key)),
  });
}
