import { ERROR_CODES, type EventStatus } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { ConflictError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { lockLifecycleEvent } from '../data/lifecycleRepo.js';
import { LIFECYCLE_TRANSITIONS } from '../domain/lifecycle.js';

/**
 * ADR-004 §4: scheduling a transition needs the transition's own Cedar action now, and the
 * worker asks again when it runs. The edge must be legal from the reviewed version's state;
 * readiness is not judged here, because it may change before the action is due.
 */
export async function requireLifecycleScheduleEdge(
  tx: PrismaTransactionClient,
  input: { actor: ActorContext; to: EventStatus; expectedVersion: number },
) {
  const { actor, to, expectedVersion } = input;
  const event = await lockLifecycleEvent(tx, actor.scope);
  if (event.lifecycleVersion !== expectedVersion) {
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'The event state changed. Reload before scheduling a transition.',
    );
  }
  const edge = LIFECYCLE_TRANSITIONS[event.status][to];
  if (!edge) {
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      `An event that is ${event.status.toLowerCase()} cannot move to ${to.toLowerCase()}.`,
    );
  }
  await requireCurrentPermission(tx, {
    scope: actor.scope,
    membershipId: actor.membershipId,
    personId: actor.volunteerId,
    action: edge.action,
  });
  return { status: event.status };
}
