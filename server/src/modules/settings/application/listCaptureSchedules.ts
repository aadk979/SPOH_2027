import {
  CaptureScheduleListResponse,
  ScopedSettingsTarget,
  type CaptureScheduleListQuery,
} from '@spoh/shared';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { toPage } from '../../../platform/db/pagination.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { systemClock } from '../../../platform/time/index.js';
import {
  captureListCreationAudits,
  captureListCursor,
  captureListRows,
} from '../data/captureScheduleListRepo.js';
import { supportedCaptureIntent, toCaptureSchedule } from '../data/captureScheduleMapper.js';
import { holdScopedMutationStation } from '../data/scopedMutationRepo.js';
import type { CaptureScheduleActor } from './prepareCaptureSchedule.js';

export function listCaptureSchedules(query: CaptureScheduleListQuery, actor: CaptureScheduleActor) {
  return prisma.$transaction(
    async (tx) => {
      await holdCaptureEvent(tx, actor.scope);
      await requireCurrentCapability(tx, {
        scope: actor.scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        capability: 'config.manage',
      });
      const target = ScopedSettingsTarget.parse(
        query.scope === 'event'
          ? { scope: query.scope }
          : { scope: query.scope, stationId: query.stationId },
      );
      if (
        target.scope === 'station' &&
        !(await holdScopedMutationStation(tx, actor.scope, target.stationId))
      )
        throw new NotFoundError('Station');
      const cursor = query.cursor
        ? await captureListCursor(tx, actor.scope, { id: query.cursor, query })
        : null;
      if (query.cursor && !cursor) throw new NotFoundError('Capture schedule cursor');
      const page = toPage(await captureListRows(tx, actor.scope, { query, cursor }), query.limit);
      const audits = await captureListCreationAudits(tx, actor.scope, page.data);
      const originals = new Map(
        audits.map((entry) => [`${entry.entityId}:${entry.actorId}`, entry.after]),
      );
      const data = page.data.flatMap((row) => {
        if (!supportedCaptureIntent(row, originals.get(`${row.id}:${row.createdByPersonId}`)))
          return [];
        const record = toCaptureSchedule(row, actor.volunteerId);
        return record ? [record] : [];
      });
      return CaptureScheduleListResponse.parse({
        eventId: actor.scope.eventId,
        target,
        key: query.key,
        evaluatedAt: (actor.clock ?? systemClock).now().toISOString(),
        data,
        meta: { count: data.length, nextCursor: page.nextCursor },
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
