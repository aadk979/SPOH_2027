import {
  ERROR_CODES,
  type EventLifecycleResponse,
  type TransitionEventRequest,
} from '@spoh/shared';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { prisma } from '../../../platform/db/client.js';
import { ConflictError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { closeRehearsalWindows } from '../../fallback/index.js';
import { lockLifecycleEvent, writeEventPhase } from '../data/lifecycleRepo.js';
import { evaluateTransition } from '../domain/lifecycle.js';
import { lifecycleSnapshot } from './lifecycleSnapshot.js';
import { toLifecycleResponse } from '../data/lifecycleMapper.js';
import { recordLifecycleTransition } from './recordLifecycleTransition.js';

function assertCurrentVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'The event state changed. Reload before transitioning again.',
    );
  }
}

/** Preparation transitions, their practice close-out, audit and retry response commit together. */
export async function transitionEvent(
  request: TransitionEventRequest,
  actor: ActorContext & { clock?: Clock },
): Promise<EventLifecycleResponse> {
  return prisma.$transaction(async (tx) => {
    const { scope, audit } = actor;
    await lockReserved(tx, scope, request.idempotencyKey);
    const event = await lockLifecycleEvent(tx, scope);
    await requireCurrentCapability(tx, {
      scope,
      membershipId: actor.membershipId,
      personId: actor.volunteerId,
      capability: 'config.manage',
    });
    assertCurrentVersion(event.lifecycleVersion, request.expectedVersion);
    const now = (actor.clock ?? systemClock).now();
    const snapshot = await lifecycleSnapshot(tx, scope, event);
    const decision = evaluateTransition(snapshot, request.to, { now, reason: request.reason });
    if (!decision.allowed) {
      throw new ConflictError(ERROR_CODES.CONFLICT, 'The event cannot make this transition.', {
        blockers: decision.blockers,
      });
    }
    const closedWindows = decision.effects.includes('rehearsal.close')
      ? await closeRehearsalWindows(tx, scope, now)
      : [];
    const row = await writeEventPhase(tx, scope, request.to);
    await recordLifecycleTransition(tx, {
      scope,
      audit,
      before: event,
      after: row,
      snapshot,
      decision,
      closedWindows,
      reason: request.reason,
    });
    const response = toLifecycleResponse(row);
    await settleReserved(tx, scope, {
      key: request.idempotencyKey,
      statusCode: 200,
      body: response,
    });
    return response;
  });
}
