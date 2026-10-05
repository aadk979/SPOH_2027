import {
  ScopedSettingsRevertResponse,
  type ScopedSettingsRevertRequest,
  type ScopedSettingsHistoryRecord,
} from '@spoh/shared';
import type { CaptureEvent } from '../../../platform/db/captureProvenance.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { IdempotencyKeyReuseError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import type { Clock } from '../../../platform/time/index.js';
import { scopedHistoryById } from '../data/scopedHistoryRepo.js';
import { toScopedHistory } from '../data/scopedHistoryMapper.js';
import type { ScopedRevertReceipt } from '../domain/scopedRevertReceipt.js';
import { scopedReadResponse } from './scopedReadResponse.js';

function assertReviewedRestore(
  receipt: ScopedRevertReceipt,
  request: ScopedSettingsRevertRequest,
): void {
  if (
    receipt.targetHistoryId !== request.historyId ||
    receipt.key !== request.key ||
    receipt.expectedVersion !== request.expectedVersion ||
    JSON.stringify(receipt.target) !== JSON.stringify(request.target)
  )
    throw new IdempotencyKeyReuseError();
}

function revertedOperation(
  history: ScopedSettingsHistoryRecord,
  selected: ScopedSettingsHistoryRecord,
) {
  if (
    !history.values.available ||
    !selected.values.available ||
    history.values.operation !== selected.values.operation
  )
    throw new NotFoundError('Setting restore');
  if (history.source !== (selected.values.operation === 'reset' ? 'RESET' : 'REVERT'))
    throw new NotFoundError('Setting restore');
  if (
    history.values.operation === 'set' &&
    selected.values.operation === 'set' &&
    JSON.stringify(history.values.after) !== JSON.stringify(selected.values.after)
  )
    throw new NotFoundError('Setting restore');
  return selected.values.operation;
}

/** Bind immutable owned restore records and rebuild current values on every successful retry. */
export async function scopedRevertResponse(
  tx: PrismaTransactionClient,
  input: {
    receipt: ScopedRevertReceipt;
    request: ScopedSettingsRevertRequest;
    actor: ActorContext & { clock?: Clock };
    event: CaptureEvent;
  },
) {
  const { receipt, request, actor, event } = input;
  assertReviewedRestore(receipt, request);
  const row = await scopedHistoryById(tx, actor.scope, receipt);
  const target = await scopedHistoryById(tx, actor.scope, {
    ...receipt,
    historyId: receipt.targetHistoryId,
  });
  if (!row || row.actorPersonId !== actor.volunteerId || !target)
    throw new NotFoundError('Setting restore');
  const history = toScopedHistory(row, actor.volunteerId);
  const selected = toScopedHistory(target, actor.volunteerId);
  const operation = revertedOperation(history, selected);
  if (row.reason !== request.reason) throw new IdempotencyKeyReuseError();
  return ScopedSettingsRevertResponse.parse({
    history,
    reviewedVersion: receipt.expectedVersion,
    revertedFrom: { historyId: selected.id, version: selected.version, operation },
    current: await scopedReadResponse(tx, { query: receipt.target, actor, event }),
  });
}
