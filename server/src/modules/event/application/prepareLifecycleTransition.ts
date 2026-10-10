import { EDITABLE_ACTION_IDS, type Action } from '@spoh/access-policies';
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
 * The edge's own action when each event grants it by role (ready, rehearse, go live, close), as
 * the enforcement point asked it. Reopening and archiving are platform admins' (C13), which the
 * transition checks against the current organisation role and names as its blocker; for them,
 * and for an edge the state machine does not have (refused below with its blockers, or a
 * competing transition that already moved the event), the member must still be one who may
 * drive this event's lifecycle at all.
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
    action: action && isEditable(action) ? action : 'Event.MarkReady',
  });
}

const isEditable = (action: Action) => (EDITABLE_ACTION_IDS as readonly string[]).includes(action);

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
    request.to === 'LIVE' && (event.status === 'CLOSED' || !!request.goLiveOverrides?.length)
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
