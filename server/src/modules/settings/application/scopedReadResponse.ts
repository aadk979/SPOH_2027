import {
  ScopedSettingsReadResponse,
  scopedOperationalKeys,
  type ScopedSettingsReadQuery,
} from '@spoh/shared';
import type { CaptureEvent } from '../../../platform/db/captureProvenance.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { scopedReadStation, scopedSettingRows } from '../data/scopedReadRepo.js';
import { toScopedSetting } from './scopedReadMapper.js';

/** The caller holds Event and current authority; this works inside reads or writes. */
export async function scopedReadResponse(
  tx: PrismaTransactionClient,
  input: {
    query: ScopedSettingsReadQuery;
    actor: ActorContext & { clock?: Clock };
    event: CaptureEvent;
  },
) {
  const { query, actor, event } = input;
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
}
