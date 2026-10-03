import { ScheduleTimelineResponse, type ScheduleTimelineQuery } from '@spoh/shared';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { toPage } from '../../../platform/db/pagination.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { toTimelineRecord } from '../data/mapper.js';
import { timelineCursor, timelineRows } from '../data/repo.js';

/** Current authority and Event-first locks guard every page, including a cached-token caller. */
export function readTimeline(
  query: ScheduleTimelineQuery,
  actor: ActorContext & { clock?: Clock },
) {
  return prisma.$transaction(
    async (tx) => {
      await holdCaptureEvent(tx, actor.scope);
      await requireCurrentCapability(tx, {
        scope: actor.scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        capability: 'config.manage',
      });
      const now = (actor.clock ?? systemClock).now();
      const cursor = query.cursor ? await timelineCursor(tx, actor.scope, query.cursor) : null;
      if (query.cursor && !cursor) {
        throw new NotFoundError('Scheduled action cursor');
      }
      const page = toPage(await timelineRows(tx, actor.scope, { query, cursor }), query.limit);
      return ScheduleTimelineResponse.parse({
        eventId: actor.scope.eventId,
        evaluatedAt: now.toISOString(),
        data: page.data.map((row) => toTimelineRecord(row, actor.volunteerId)),
        meta: { count: page.data.length, nextCursor: page.nextCursor },
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
