import type { ScopedSettingsHistoryRecord, ScopedSettingsRevertRequest } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { ValidationError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import {
  changeSettingInTransaction,
  resetSettingInTransaction,
} from '../../../platform/settings/change.js';
import type { SettingTarget } from '../../../platform/settings/scopedStore.js';

/** The historical operation selects the same guarded writer as a reviewed manual set/reset. */
export function applyScopedRevert(
  tx: PrismaTransactionClient,
  input: {
    request: ScopedSettingsRevertRequest;
    history: ScopedSettingsHistoryRecord;
    actor: ActorContext;
  },
) {
  const { request, history, actor } = input;
  if (!history.values.available)
    throw new ValidationError('This historical setting value is unavailable.');
  const target: SettingTarget =
    request.target.scope === 'event'
      ? { scope: 'event', eventId: actor.scope.eventId }
      : { scope: 'station', eventId: actor.scope.eventId, stationId: request.target.stationId };
  const change = {
    target,
    key: request.key,
    expectedVersion: request.expectedVersion,
    actorPersonId: actor.volunteerId,
    audit: actor.audit,
    reason: request.reason,
    revertedFrom: { historyId: history.id, version: history.version },
  };
  return history.values.operation === 'reset'
    ? resetSettingInTransaction(tx, change)
    : changeSettingInTransaction(tx, { ...change, value: history.values.after, source: 'REVERT' });
}
