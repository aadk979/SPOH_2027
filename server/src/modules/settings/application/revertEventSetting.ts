import { ChangeEventSettingRequest, type RevertEventSettingRequest } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { eventSettingHistoryById } from '../data/historyRepo.js';
import { toEventSettingHistory } from '../data/historyMapper.js';
import { toRevertReceipt } from '../domain/revertReceipt.js';
import { applyEventSettingChange } from './changeEventSetting.js';
import { lockEventSettingAuthority } from './lockEventSettingAuthority.js';
import { productRevertResponse } from './productRevertResponse.js';

/** Restoring history uses the exact guarded product write, including privacy purge. */
export function revertEventSetting(request: RevertEventSettingRequest, actor: ActorContext) {
  return prisma.$transaction(
    async (tx) => {
      await lockEventSettingAuthority(tx, actor);
      await lockReserved(tx, actor.scope, request.idempotencyKey);
      const target = await eventSettingHistoryById(tx, actor.scope, {
        key: request.key,
        id: request.historyId,
      });
      if (!target) throw new NotFoundError('Setting history');
      const historical = toEventSettingHistory(target, actor.volunteerId);
      if (!historical.values.available)
        throw new ValidationError('This historical setting value is unavailable.');
      const change = ChangeEventSettingRequest.parse({
        key: request.key,
        value: historical.values.after,
        expectedVersion: request.expectedVersion,
        reason: request.reason,
      });
      const history = await applyEventSettingChange(tx, {
        change,
        actor,
        source: 'REVERT',
        revertedFrom: { historyId: target.id, version: target.version },
      });
      const response = await productRevertResponse(tx, {
        actor,
        receipt: {
          historyId: history.id,
          targetHistoryId: target.id,
          key: request.key,
          expectedVersion: request.expectedVersion,
        },
      });
      await settleReserved(tx, actor.scope, {
        key: request.idempotencyKey,
        statusCode: 200,
        body: toRevertReceipt(response),
      });
      return response;
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
