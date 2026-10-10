import { ERROR_CODES, type ScopedSettingsMutationRequest } from '@spoh/shared';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import {
  changeSettingInTransaction,
  resetSettingInTransaction,
} from '../../../platform/settings/change.js';
import type { SettingTarget } from '../../../platform/settings/scopedStore.js';
import type { Clock } from '../../../platform/time/index.js';
import { holdScopedMutationStation, scopedMutationByVersion } from '../data/scopedMutationRepo.js';
import { toScopedMutationReceipt } from '../domain/scopedMutationReceipt.js';
import { lockEventSettingAuthority } from './lockEventSettingAuthority.js';
import { scopedMutationResponse } from './scopedMutationResponse.js';

function applyOperationalSetting(
  tx: PrismaTransactionClient,
  input: {
    request: ScopedSettingsMutationRequest;
    actor: ActorContext;
  },
) {
  const { request, actor } = input;
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
  };
  return request.operation === 'set'
    ? changeSettingInTransaction(tx, { ...change, value: request.value })
    : resetSettingInTransaction(tx, change);
}

export function mutateScopedSetting(
  request: ScopedSettingsMutationRequest,
  actor: ActorContext & { clock?: Clock },
) {
  return prisma.$transaction(
    async (tx) => {
      await lockEventSettingAuthority(tx, actor, request.key);
      const event = await holdCaptureEvent(tx, actor.scope);
      if (event.status === 'ARCHIVED')
        throw new ConflictError(
          ERROR_CODES.SETTING_LOCKED,
          'Archived event settings are read-only.',
        );
      if (
        request.target.scope === 'station' &&
        !(await holdScopedMutationStation(tx, actor.scope, request.target.stationId))
      )
        throw new NotFoundError('Station');
      await lockReserved(tx, actor.scope, request.idempotencyKey);
      const version = await applyOperationalSetting(tx, { request, actor });
      const row = await scopedMutationByVersion(tx, actor.scope, { ...request, version });
      if (!row) throw new NotFoundError('Setting change');
      const response = await scopedMutationResponse(tx, {
        receipt: {
          historyId: row.id,
          key: request.key,
          target: request.target,
          expectedVersion: request.expectedVersion,
        },
        request,
        actor,
        event,
      });
      await settleReserved(tx, actor.scope, {
        key: request.idempotencyKey,
        statusCode: 200,
        body: toScopedMutationReceipt(response),
      });
      return response;
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
