import {
  ACTION_CATALOGUE,
  ACTION_IDS,
  ROLE_IDS,
  ROLE_RANKS,
  type Action,
} from '@spoh/access-policies';
import { ACTION_LABELS, type RolePermissionsResponse } from '@spoh/shared';
import { databaseRoleGrants } from '../../../platform/access/authorizer/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { minimumRoleOf } from '../domain/permissionRules.js';
import { GUARDRAILS } from '../domain/policyExplanations.js';

/** Actions a member can hold; the person-only platform actions are not listed per role. */
const LISTED = ACTION_IDS.filter((action) =>
  (ACTION_CATALOGUE[action].principalTypes as readonly string[]).includes('Membership'),
);

/** The event's roles and what each may do, for the permissions screen (P11.7). */
export async function readRolePermissions(
  scope: EventScope,
  input: { canEdit: boolean },
  db: PrismaTransactionClient = prisma,
): Promise<RolePermissionsResponse['data']> {
  const grants = await databaseRoleGrants.grantsFor(db, scope.eventId);
  return {
    roles: ROLE_IDS.map((role) => ({
      role,
      rank: ROLE_RANKS[role],
      grants: grants[role].grants.filter((action): action is Action =>
        (ACTION_IDS as readonly string[]).includes(action),
      ),
      anyStation: grants[role].anyStation,
    })),
    actions: LISTED.map((action) => {
      const minimumRole = minimumRoleOf(action);
      return {
        action,
        label: ACTION_LABELS[action],
        groups: [...ACTION_CATALOGUE[action].groups],
        editable: minimumRole !== null,
        minimumRole,
      };
    }),
    guardrails: [...GUARDRAILS],
    canEdit: input.canEdit,
  };
}
