import { ERROR_CODES, outranks, type CommitteeRole } from '@spoh/shared';
import { AppError } from '../../../platform/errors/index.js';

/**
 * The escalation rules as provisioning and the import apply them (F03-001):
 * not your own account, nobody at or above you, and no role at or above
 * yours. `where` names the row in an import, so the refusal says which line
 * to fix.
 */
export function assertMayManage(
  actor: { volunteerId: string; role: CommitteeRole },
  change: { role: CommitteeRole; existing: { id: string; role: CommitteeRole } | null },
  where = '',
): void {
  if (change.existing?.id === actor.volunteerId) {
    throw new AppError(
      403,
      ERROR_CODES.SELF_MUTATION_DENIED,
      `${where}You cannot change your own account. Ask another administrator.`,
    );
  }
  if (!outranks(actor.role, change.role)) {
    throw new AppError(
      403,
      ERROR_CODES.ROLE_ESCALATION_DENIED,
      `${where}You cannot grant a role at or above your own.`,
    );
  }
  if (change.existing && !outranks(actor.role, change.existing.role)) {
    throw new AppError(
      403,
      ERROR_CODES.ROLE_ESCALATION_DENIED,
      `${where}You cannot change an account at or above your own level.`,
    );
  }
}
