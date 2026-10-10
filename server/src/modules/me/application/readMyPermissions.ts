import type { Role } from '@spoh/access-policies';
import type { MyPermissionsResponse } from '@spoh/shared';
import { memberPermissions } from '../../../platform/access/memberPermissions.js';
import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** What the caller may do in this event, for the screens (P11.8, ADR-005 §6). */
export function readMyPermissions(
  scope: EventScope,
  member: { membershipId: string; role: Role; ip: string | null },
): Promise<MyPermissionsResponse> {
  return memberPermissions(prisma, { scope, ...member });
}
