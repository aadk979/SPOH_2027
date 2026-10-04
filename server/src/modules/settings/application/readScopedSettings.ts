import {
  ScopedSettingsReadResponse,
  scopedOperationalKeys,
  type ScopedSettingsReadQuery,
} from '@spoh/shared';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { scopedReadStation, scopedSettingRows } from '../data/scopedReadRepo.js';
import { toScopedSetting } from './scopedReadMapper.js';

export function readScopedSettings(
  query: ScopedSettingsReadQuery,
  actor: ActorContext & { clock?: Clock },
) {
  return prisma.$transaction(
    async (tx) => {
      const event = await holdCaptureEvent(tx, actor.scope);
      await requireCurrentCapability(tx, {
        scope: actor.scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        capability: 'config.manage',
      });
      if (query.stationId && !(await scopedReadStation(tx, actor.scope, query.stationId)))
        throw new NotFoundError('Station');
      const now = (actor.clock ?? systemClock).now();
      const keys = scopedOperationalKeys(query.scope);
      const rows = await scopedSettingRows(tx, actor.scope, {
        organisationId: event.organisationId,
        query,
        keys,
      });
      return ScopedSettingsReadResponse.parse({
        eventId: actor.scope.eventId,
        target: query,
        eventStatus: event.status,
        evaluatedAt: now.toISOString(),
        data: keys.map((key) => toScopedSetting(key, rows, query.scope)),
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
