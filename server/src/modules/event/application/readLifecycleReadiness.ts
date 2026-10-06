import type { LifecycleReadinessResponse } from '@spoh/shared';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { prisma } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { hoursAfter, systemClock, type Clock } from '../../../platform/time/index.js';
import { currentOrganisationRole } from '../data/lifecycleAuthorityRepo.js';
import { toLifecycleResponse } from '../data/lifecycleMapper.js';
import { lockReadinessEvent } from '../data/lifecycleRepo.js';
import { readinessTransitions } from '../domain/readinessTransitions.js';
import { REOPEN_HOURS } from '../domain/lifecycle.js';
import { lifecycleSnapshot } from './lifecycleSnapshot.js';
import { publicGoLiveReadiness } from './publicGoLiveReadiness.js';

/** Current authority and guard evidence share Event-first locks; this read has no effects. */
export async function readLifecycleReadiness(
  actor: ActorContext & { clock?: Clock },
): Promise<LifecycleReadinessResponse> {
  return prisma.$transaction(
    async (tx) => {
      const { scope } = actor;
      const event = await lockReadinessEvent(tx, scope);
      await requireCurrentCapability(tx, {
        scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        capability: 'config.manage',
      });
      const now = (actor.clock ?? systemClock).now();
      const snapshot = await lifecycleSnapshot(tx, scope, { event, now });
      const member =
        event.status === 'CLOSED'
          ? await currentOrganisationRole(tx, {
              organisationId: event.organisationId,
              personId: actor.volunteerId,
            })
          : null;
      return {
        ...toLifecycleResponse(event),
        evaluatedAt: now.toISOString(),
        goLiveReadiness: publicGoLiveReadiness(snapshot.goLiveReadiness),
        reopenUntil:
          event.status === 'CLOSED' && event.closedAt
            ? hoursAfter(event.closedAt, REOPEN_HOURS).toISOString()
            : null,
        transitions: readinessTransitions(snapshot, {
          now,
          platformAdmin: member?.role === 'PLATFORM_ADMIN',
        }),
      };
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
