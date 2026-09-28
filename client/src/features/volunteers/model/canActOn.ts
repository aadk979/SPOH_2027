import { ROLE_PRECEDENCE, type CommitteeRole } from '@spoh/shared';

export function canActOn(
  viewerRole: CommitteeRole | undefined,
  targetRole: CommitteeRole,
): boolean {
  if (!viewerRole) return false;
  return ROLE_PRECEDENCE[viewerRole] < ROLE_PRECEDENCE[targetRole];
}
