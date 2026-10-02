import { ERROR_CODES, type LifecycleTransitionInput } from '@spoh/shared';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { ConflictError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { currentOrganisationRole } from '../data/lifecycleAuthorityRepo.js';
import { lockLifecycleEvent } from '../data/lifecycleRepo.js';
import { evaluateTransition } from '../domain/lifecycle.js';
import { lifecycleSnapshot } from './lifecycleSnapshot.js';

/** Every guard is evaluated under the event lock and current membership authority. */
export async function prepareLifecycleTransition(
  tx: PrismaTransactionClient,
  input: { request: LifecycleTransitionInput; actor: ActorContext & { clock?: Clock } },
) {
  const { request, actor } = input;
  const { scope } = actor;
  const event = await lockLifecycleEvent(tx, scope);
  await requireCurrentCapability(tx, {
    scope,
    membershipId: actor.membershipId,
    personId: actor.volunteerId,
    capability: 'config.manage',
  });
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
