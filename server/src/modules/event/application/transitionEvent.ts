import { type EventLifecycleResponse, type TransitionEventRequest } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { settleReserved } from '../../../platform/idempotency/index.js';
import { type Clock } from '../../../platform/time/index.js';
import { toLifecycleResponse } from '../data/lifecycleMapper.js';
import { recordLifecycleTransition } from './recordLifecycleTransition.js';
import { applyLifecycleEffects } from './applyLifecycleEffects.js';
import { prepareLifecycleTransition } from './prepareLifecycleTransition.js';

/** Read committed sees writers that committed while the exclusive event lock was waiting. */
export async function transitionEvent(
  request: TransitionEventRequest,
  actor: ActorContext & { clock?: Clock },
): Promise<EventLifecycleResponse> {
  return prisma.$transaction(
    async (tx) => {
      const { scope, audit } = actor;
      const { event, snapshot, decision, now } = await prepareLifecycleTransition(tx, {
        actor,
        request,
      });
      const { row, closedWindows, closeOut, reopen } = await applyLifecycleEffects(tx, {
        actor,
        event,
        decision,
        now,
      });
      await recordLifecycleTransition(tx, {
        scope,
        audit,
        before: event,
        after: row,
        snapshot,
        decision,
        closedWindows,
        closeOut,
        reopen,
        reason: request.reason,
      });
      const response = toLifecycleResponse(row);
      await settleReserved(tx, scope, {
        key: request.idempotencyKey,
        statusCode: 200,
        body: response,
      });
      return response;
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
