import {
  ACTION_CATALOGUE,
  EDITABLE_ACTION_IDS,
  ROLE_RANKS,
  type Action,
  type Role,
} from '@spoh/access-policies';
import { ValidationError } from '../../../platform/errors/index.js';

/** The lowest role an action may be granted to, or null when no editor may toggle it. */
export function minimumRoleOf(action: Action): Role | null {
  if (!(EDITABLE_ACTION_IDS as readonly string[]).includes(action)) return null;
  const floor = ACTION_CATALOGUE[action].minimumRole;
  return floor.status === 'approved' ? floor.role : null;
}

/**
 * An editor toggles only Editable actions, and only for roles at or above the action's floor
 * (ADR-005 §4). Guardrails, self-service and platform actions are fixed.
 */
export function assertTogglable(role: Role, action: Action): void {
  const floor = minimumRoleOf(action);
  if (floor === null) {
    throw new ValidationError('That permission is fixed.', { action });
  }
  if (ROLE_RANKS[role] < ROLE_RANKS[floor]) {
    throw new ValidationError('That permission cannot be given to a role below its minimum.', {
      action,
      role,
      minimumRole: floor,
    });
  }
}
