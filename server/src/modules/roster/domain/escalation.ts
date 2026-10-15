import { ERROR_CODES, outranks, type CommitteeRole } from '@spoh/shared';
import { AppError } from '../../../platform/errors/index.js';

/**
 * The escalation rules as provisioning and the import apply them (F03-001):
 * Never your own account. Committee members act on and grant only lower ranks;
 * a caller that has proved the platform Person policy uses its separate authority.
 * `where` names the row in an import, so the refusal says which line to fix.
 */
export function assertMayManage(
  actor: { volunteerId: string; role: CommitteeRole; platformAdmin?: boolean },
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
  if (!actor.platformAdmin && !outranks(actor.role, change.role)) {
    throw new AppError(
      403,
      ERROR_CODES.ROLE_ESCALATION_DENIED,
      `${where}You cannot grant a role at or above your own.`,
    );
  }
  if (!actor.platformAdmin && change.existing && !outranks(actor.role, change.existing.role)) {
    throw new AppError(
      403,
      ERROR_CODES.ROLE_ESCALATION_DENIED,
      `${where}You cannot change an account at or above your own level.`,
    );
  }
}
