import type { Role } from '@spoh/access-policies';
import {
  ACTION_LABELS,
  type MemberPermissionsResponse,
  type SimulatePermissionRequest,
  type SimulatePermissionResponse,
} from '@spoh/shared';
import { EntityBuilder } from '../../../platform/access/authorizer/index.js';
import { currentAuthorizer } from '../../../platform/access/engine.js';
import { memberPermissions } from '../../../platform/access/memberPermissions.js';
import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { findMember } from '../data/repo.js';
import { explain } from '../domain/policyExplanations.js';

async function requireMember(scope: EventScope, personId: string) {
  const member = await findMember(prisma, scope, personId);
  if (!member) throw new NotFoundError('Member');
  return member;
}

/**
 * "Can ⟨member⟩ do ⟨action⟩ on ⟨resource⟩ now?" (P11.7): the same policies and the event's own
 * grants decide, read now, with the deciding policies and why in plain language. A resource the
 * request names that is not in this event answers 404, as everywhere else.
 */
export async function simulatePermission(
  scope: EventScope,
  request: SimulatePermissionRequest,
): Promise<SimulatePermissionResponse['data']> {
  const member = await requireMember(scope, request.personId);
  const builder = new EntityBuilder(prisma, { eventId: scope.eventId, now: systemClock.now() });
  const question = await builder.forMembership(member.id, {
    action: request.action,
    resource: request.resource ?? { type: 'Event', id: scope.eventId },
  });
  const decision = await currentAuthorizer().isAuthorized(question);
  const allowed = decision.allowed && decision.errors.length === 0;
  const policies = [...decision.determiningPolicies];
  return {
    allowed,
    policies,
    explanation: explain(allowed, policies, ACTION_LABELS[request.action]),
  };
}

/** "What can ⟨member⟩ do?": the answer `/me/permissions` gives them, read for an editor. */
export async function readMemberPermissions(
  scope: EventScope,
  personId: string,
): Promise<MemberPermissionsResponse['data']> {
  const member = await requireMember(scope, personId);
  const { actions } = await memberPermissions(prisma, {
    scope,
    membershipId: member.id,
    role: member.role as Role,
  });
  return { personId, role: member.role, actions };
}
