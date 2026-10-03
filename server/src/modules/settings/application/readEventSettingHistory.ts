import { EventSettingHistoryResponse, type EventSettingHistoryQuery } from '@spoh/shared';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { toPage } from '../../../platform/db/pagination.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { toEventSettingHistory } from '../data/historyMapper.js';
import { eventSettingHistoryCursor, eventSettingHistoryRows } from '../data/historyRepo.js';

export function readEventSettingHistory(
  query: EventSettingHistoryQuery,
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
      const cursor = query.cursor ? await eventSettingHistoryCursor(tx, actor.scope, query) : null;
      if (query.cursor && !cursor) throw new NotFoundError('Setting history cursor');
      const page = toPage(
        await eventSettingHistoryRows(tx, actor.scope, { query, cursor }),
        query.limit,
      );
      return EventSettingHistoryResponse.parse({
        eventId: actor.scope.eventId,
        key: query.key,
        evaluatedAt: now.toISOString(),
        data: page.data.map((row) => toEventSettingHistory(row, actor.volunteerId)),
        meta: { count: page.data.length, nextCursor: page.nextCursor },
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
