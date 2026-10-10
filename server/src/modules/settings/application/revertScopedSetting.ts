import { ERROR_CODES, type ScopedSettingsRevertRequest } from '@spoh/shared';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { prisma } from '../../../platform/db/client.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import type { Clock } from '../../../platform/time/index.js';
import { scopedHistoryById } from '../data/scopedHistoryRepo.js';
import { toScopedHistory } from '../data/scopedHistoryMapper.js';
import { holdScopedMutationStation, scopedMutationByVersion } from '../data/scopedMutationRepo.js';
import { toScopedRevertReceipt } from '../domain/scopedRevertReceipt.js';
import { applyScopedRevert } from './applyScopedRevert.js';
import { lockEventSettingAuthority } from './lockEventSettingAuthority.js';
import { scopedRevertResponse } from './scopedRevertResponse.js';

export function revertScopedSetting(
  request: ScopedSettingsRevertRequest,
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
      const selected = await scopedHistoryById(tx, actor.scope, request);
      if (!selected) throw new NotFoundError('Setting history');
      const version = await applyScopedRevert(tx, {
        request,
        history: toScopedHistory(selected, actor.volunteerId),
        actor,
      });
      const row = await scopedMutationByVersion(tx, actor.scope, { ...request, version });
      if (!row) throw new NotFoundError('Setting restore');
      const receipt = {
        historyId: row.id,
        targetHistoryId: selected.id,
        key: request.key,
        target: request.target,
        expectedVersion: request.expectedVersion,
      };
      const response = await scopedRevertResponse(tx, { receipt, request, actor, event });
      await settleReserved(tx, actor.scope, {
        key: request.idempotencyKey,
        statusCode: 200,
        body: toScopedRevertReceipt(response),
      });
      return response;
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
