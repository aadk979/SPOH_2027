import type { Action, Role } from '@spoh/access-policies';
import type { PrismaTransactionClient } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { ForbiddenError } from '../errors/index.js';
import { systemClock, type Clock } from '../time/index.js';
import {
  databaseRoleGrants,
  EntityBuilder,
  type Question,
  type ResourceRef,
} from './authorizer/index.js';
import { currentAuthorizer, USE_CASE_PHASE_GUARDRAILS } from './engine.js';

export interface CurrentPermission {
  readonly scope: EventScope;
  readonly membershipId: string;
  readonly personId: string;
  readonly action: Action;
  /**
   * What the action is taken on; the event when absent. A list is asked as "any of them"
   * (see `stationCandidates`), and an empty list answers with the role's grant in the event.
   */
  readonly resource?: ResourceRef | readonly ResourceRef[];
  readonly clock?: Clock;
}

/**
 * Recheck a permission under a membership lock before a sensitive step: the member's role,
 * status or the event's grants may have changed since the enforcement point asked, or a
 * scheduled action runs long after its author scheduled it. The same policies decide, from
 * the transaction's own reads (ADR-005 §1). A refusal by a phase guardrail alone is left to
 * the caller's own phase check, which gives the reason the screens show; any other refusal
 * means the permission changed.
 */
export async function requireCurrentPermission(
  tx: PrismaTransactionClient,
  input: CurrentPermission,
): Promise<void> {
  const { scope, membershipId, personId, action } = input;
  await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE "eventId" = ${scope.eventId}
    AND id = ${membershipId} AND "personId" = ${personId} FOR SHARE`;
  const member = await tx.eventMembership.findFirst({
    where: { eventId: scope.eventId, id: membershipId, personId },
    select: { status: true, role: true },
  });
  if (!member || member.status !== 'ACTIVE') throw changed(action);
  const resources = resourcesOf(input);
  if (resources.length === 0) {
    const grants = await databaseRoleGrants.grantsFor(tx, scope.eventId);
    if (grants[member.role as Role].grants.includes(action)) return;
    throw changed(action);
  }
  const builder = new EntityBuilder(tx, {
    eventId: scope.eventId,
    now: (input.clock ?? systemClock).now(),
  });
  for (const resource of resources) {
    if (await allows(builder, membershipId, { action, resource })) return;
  }
  throw changed(action);
}

function resourcesOf(input: CurrentPermission): readonly ResourceRef[] {
  const { resource } = input;
  if (resource === undefined) return [{ type: 'Event', id: input.scope.eventId }];
  return isList(resource) ? resource : [resource];
}

function isList(value: ResourceRef | readonly ResourceRef[]): value is readonly ResourceRef[] {
  return Array.isArray(value);
}

async function allows(
  builder: EntityBuilder,
  membershipId: string,
  question: Question,
): Promise<boolean> {
  const request = await builder.forMembership(membershipId, question);
  const decision = await currentAuthorizer().isAuthorized(request);
  if (decision.errors.length > 0) return false;
  if (decision.allowed) return true;
  const policies = decision.determiningPolicies;
  return policies.length > 0 && policies.every((policy) => USE_CASE_PHASE_GUARDRAILS.has(policy));
}

const changed = (action: Action) =>
  new ForbiddenError('Your event permission changed. Reload before trying again.', {
    required: action,
  });
