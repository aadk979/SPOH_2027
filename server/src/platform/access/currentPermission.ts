import type { Action, Role } from '@spoh/access-policies';
import type { PrismaTransactionClient } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { ForbiddenError, NotFoundError, ServiceUnavailableError } from '../errors/index.js';
import { systemClock, type Clock } from '../time/index.js';
import {
  databaseRoleGrants,
  EntityBuilder,
  type Question,
  type ResourceRef,
  type RequestFacts,
} from './authorizer/index.js';
import { currentAuthorizer, USE_CASE_PHASE_GUARDRAILS } from './engine.js';

export interface CurrentPermission {
  readonly scope: EventScope;
  readonly membershipId: string;
  readonly personId: string;
  readonly action: Action;
  /** Explicit person policy, still requiring an active event membership and current organisation standing. */
  readonly asPerson?: boolean;
  /**
   * What the action is taken on; the event when absent. A list is asked as "any of them"
   * (see `stationCandidates`), and an empty list answers with the role's grant in the event.
   */
  readonly resource?: ResourceRef | readonly ResourceRef[];
  readonly clock?: Clock;
  readonly facts?: RequestFacts;
  readonly shiftAt?: Date;
}

/** Caller holds Event first; all authority writers must retain this Person → member order. */
export async function lockCurrentActor(
  tx: PrismaTransactionClient,
  input: { scope: EventScope; membershipId: string; personId: string },
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${input.personId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE "eventId" = ${input.scope.eventId}
    AND id = ${input.membershipId} AND "personId" = ${input.personId} FOR SHARE`;
  const person = await tx.person.findUnique({
    where: { id: input.personId },
    select: { deactivatedAt: true, piiErasedAt: true },
  });
  const member = await tx.eventMembership.findFirst({
    where: { eventId: input.scope.eventId, id: input.membershipId, personId: input.personId },
    select: { status: true },
  });
  if (
    !person ||
    person.deactivatedAt !== null ||
    person.piiErasedAt !== null ||
    member?.status !== 'ACTIVE'
  )
    throw new ForbiddenError('Your event permission changed. Reload before trying again.');
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
  await lockCurrentActor(tx, { scope, membershipId, personId });
  const member = await tx.eventMembership.findFirst({
    where: { eventId: scope.eventId, id: membershipId, personId },
    select: { status: true, role: true },
  });
  if (!member || member.status !== 'ACTIVE') throw changed(action);
  const resources = resourcesOf(input);
  if (resources.length === 0) {
    await requireStandingGrant(tx, input, member.role as Role);
    return;
  }
  const builder = new EntityBuilder(tx, {
    eventId: scope.eventId,
    now: (input.clock ?? systemClock).now(),
    ...(input.shiftAt ? { shiftAt: input.shiftAt } : {}),
  });
  if (input.asPerson) {
    await lockOrganisationStanding(tx, scope, personId);
  }
  for (const resource of resources) {
    if (
      await allows(
        builder,
        { membershipId, personId, asPerson: input.asPerson === true },
        {
          action,
          resource,
          ...(input.facts ? { facts: input.facts } : {}),
        },
      )
    )
      return;
  }
  throw changed(action);
}

async function requireStandingGrant(
  tx: PrismaTransactionClient,
  input: CurrentPermission,
  role: Role,
): Promise<void> {
  if (input.asPerson) throw changed(input.action);
  const grants = await databaseRoleGrants.grantsFor(tx, input.scope.eventId);
  if (!grants[role].grants.includes(input.action)) throw changed(input.action);
}

async function lockOrganisationStanding(
  tx: PrismaTransactionClient,
  scope: EventScope,
  personId: string,
): Promise<void> {
  const event = await tx.event.findUnique({
    where: { id: scope.eventId },
    select: { organisationId: true },
  });
  if (!event) throw new NotFoundError('Event');
  await tx.$queryRaw`SELECT id FROM "OrganisationMembership" WHERE "organisationId" = ${event.organisationId}
    AND "personId" = ${personId} FOR SHARE`;
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
  actor: { membershipId: string; personId: string; asPerson: boolean },
  question: Question,
): Promise<boolean> {
  try {
    const request = actor.asPerson
      ? await builder.forPerson(actor.personId, question)
      : await builder.forMembership(actor.membershipId, question);
    const decision = await currentAuthorizer().isAuthorized(request);
    if (decision.errors.length > 0)
      throw new ServiceUnavailableError('Permissions could not be checked.');
    if (decision.allowed) return true;
    const policies = decision.determiningPolicies;
    return policies.length > 0 && policies.every((policy) => USE_CASE_PHASE_GUARDRAILS.has(policy));
  } catch (cause) {
    if (cause instanceof NotFoundError) return false;
    if (cause instanceof ServiceUnavailableError) throw cause;
    throw new ServiceUnavailableError('Permissions could not be checked.', cause);
  }
}

const changed = (action: Action) =>
  new ForbiddenError('Your event permission changed. Reload before trying again.', {
    required: action,
  });
