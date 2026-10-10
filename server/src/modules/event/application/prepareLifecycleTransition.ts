import { ERROR_CODES, type EventStatus, type LifecycleTransitionInput } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { ConflictError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { currentOrganisationRole } from '../data/lifecycleAuthorityRepo.js';
import { lockLifecycleEvent } from '../data/lifecycleRepo.js';
import { evaluateTransition, LIFECYCLE_TRANSITIONS } from '../domain/lifecycle.js';
import { lifecycleSnapshot } from './lifecycleSnapshot.js';

/**
 * Ask the exact edge action, including the locked reopen/archive actions. Their Cedar member
 * policy reads current organisation platform authority independently of the event's role.
 * An illegal edge still requires standing lifecycle authority before returning its blockers.
 */
function requireTransitionPermission(
  tx: PrismaTransactionClient,
  input: { actor: ActorContext; from: EventStatus; to: EventStatus },
) {
  const action = LIFECYCLE_TRANSITIONS[input.from][input.to]?.action;
  return requireCurrentPermission(tx, {
    scope: input.actor.scope,
    membershipId: input.actor.membershipId,
    personId: input.actor.volunteerId,
    action: action ?? 'Event.MarkReady',
  });
}

/** Every guard is evaluated under the event lock and current membership authority. */
export async function prepareLifecycleTransition(
  tx: PrismaTransactionClient,
  input: { request: LifecycleTransitionInput; actor: ActorContext & { clock?: Clock } },
) {
  const { request, actor } = input;
  const { scope } = actor;
  const event = await lockLifecycleEvent(tx, scope);
  await requireTransitionPermission(tx, { actor, from: event.status, to: request.to });
  if (event.lifecycleVersion !== request.expectedVersion) {
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'The event state changed. Reload before transitioning again.',
    );
  }
  const now = (actor.clock ?? systemClock).now();
  const snapshot = await lifecycleSnapshot(tx, scope, { event, now });
  const organisationMember =
    request.to === 'ARCHIVED' ||
    (request.to === 'LIVE' && (event.status === 'CLOSED' || !!request.goLiveOverrides?.length))
      ? await currentOrganisationRole(tx, {
          organisationId: event.organisationId,
          personId: actor.volunteerId,
        })
      : null;
  const decision = evaluateTransition(snapshot, request.to, {
    now,
    reason: request.reason,
    platformAdmin: organisationMember?.role === 'PLATFORM_ADMIN',
    goLiveOverrides: request.goLiveOverrides,
  });
  if (!decision.allowed) {
    throw new ConflictError(ERROR_CODES.CONFLICT, 'The event cannot make this transition.', {
      blockers: decision.blockers,
    });
  }
  return { event, snapshot, decision, now };
}
