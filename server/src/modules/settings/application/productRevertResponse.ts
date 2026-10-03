import { RevertEventSettingResponse } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { eventSettings } from '../../../platform/settings/eventSettings.js';
import { eventSettingHistoryById } from '../data/historyRepo.js';
import { toEventSettingHistory } from '../data/historyMapper.js';
import type { EventSettingRevertReceipt } from '../domain/revertReceipt.js';

/** Called with Event and current authority held; replays rebuild from the current rows. */
export async function productRevertResponse(
  tx: PrismaTransactionClient,
  input: { actor: ActorContext; receipt: EventSettingRevertReceipt },
) {
  const { actor, receipt } = input;
  const row = await eventSettingHistoryById(tx, actor.scope, {
    key: receipt.key,
    id: receipt.historyId,
  });
  const target = await eventSettingHistoryById(tx, actor.scope, {
    key: receipt.key,
    id: receipt.targetHistoryId,
  });
  if (!row || row.source !== 'REVERT' || row.actorPersonId !== actor.volunteerId || !target)
    throw new NotFoundError('Setting revert');
  return RevertEventSettingResponse.parse({
    history: toEventSettingHistory(row, actor.volunteerId),
    current: await eventSettings(actor.scope, tx),
    reviewedVersion: receipt.expectedVersion,
    revertedFrom: { historyId: target.id, version: target.version },
  });
}
