import {
  ScopedSettingsHistoryResponse,
  ScopedSettingsTarget,
  type ScopedSettingsHistoryQuery,
} from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { prisma } from '../../../platform/db/client.js';
import { toPage } from '../../../platform/db/pagination.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { toScopedHistory } from '../data/scopedHistoryMapper.js';
import { scopedHistoryCursor, scopedHistoryRows } from '../data/scopedHistoryRepo.js';
import { scopedReadStation } from '../data/scopedReadRepo.js';

export function readScopedHistory(
  query: ScopedSettingsHistoryQuery,
  actor: ActorContext & { clock?: Clock },
) {
  return prisma.$transaction(
    async (tx) => {
      const event = await holdCaptureEvent(tx, actor.scope);
      await requireCurrentPermission(tx, {
        scope: actor.scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        action: 'Settings.Read',
      });
      const target = ScopedSettingsTarget.parse({
        scope: query.scope,
        ...(query.stationId ? { stationId: query.stationId } : {}),
      });
      if (
        target.scope === 'station' &&
        !(await scopedReadStation(tx, actor.scope, target.stationId))
      )
        throw new NotFoundError('Station');
      const now = (actor.clock ?? systemClock).now();
      const selection = { target, key: query.key };
      const cursor = query.cursor
        ? await scopedHistoryCursor(tx, actor.scope, { ...selection, cursor: query.cursor })
        : null;
      if (query.cursor && !cursor) throw new NotFoundError('Setting history cursor');
      const page = toPage(
        await scopedHistoryRows(tx, actor.scope, { ...selection, limit: query.limit, cursor }),
        query.limit,
      );
      return ScopedSettingsHistoryResponse.parse({
        eventId: actor.scope.eventId,
        target,
        key: query.key,
        eventStatus: event.status,
        evaluatedAt: now.toISOString(),
        data: page.data.map((row) => toScopedHistory(row, actor.volunteerId)),
        meta: { count: page.data.length, nextCursor: page.nextCursor },
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
