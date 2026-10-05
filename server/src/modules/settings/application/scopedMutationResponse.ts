import { ScopedSettingsMutationResponse, type ScopedSettingsMutationRequest } from '@spoh/shared';
import type { CaptureEvent } from '../../../platform/db/captureProvenance.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { IdempotencyKeyReuseError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import type { Clock } from '../../../platform/time/index.js';
import { scopedMutationById } from '../data/scopedMutationRepo.js';
import type { ScopedMutationReceipt } from '../domain/scopedMutationReceipt.js';
import { scopedReadResponse } from './scopedReadResponse.js';

function assertReviewedTarget(
  receipt: ScopedMutationReceipt,
  request: ScopedSettingsMutationRequest,
): void {
  if (
    receipt.key !== request.key ||
    receipt.expectedVersion !== request.expectedVersion ||
    JSON.stringify(receipt.target) !== JSON.stringify(request.target)
  )
    throw new IdempotencyKeyReuseError();
}

/** Immutable owned history binds the intent while current values are rebuilt on every replay. */
export async function scopedMutationResponse(
  tx: PrismaTransactionClient,
  input: {
    receipt: ScopedMutationReceipt;
    request: ScopedSettingsMutationRequest;
    actor: ActorContext & { clock?: Clock };
    event: CaptureEvent;
  },
) {
  const { receipt, request, actor, event } = input;
  assertReviewedTarget(receipt, request);
  const row = await scopedMutationById(tx, actor.scope, receipt);
  if (!row || row.actorPersonId !== actor.volunteerId || !['USER', 'RESET'].includes(row.source))
    throw new NotFoundError('Setting change');
  const operation = row.source === 'RESET' ? 'reset' : 'set';
  if (
    operation !== request.operation ||
    row.reason !== request.reason ||
    (request.operation === 'set' && JSON.stringify(row.after) !== JSON.stringify(request.value))
  )
    throw new IdempotencyKeyReuseError();
  return ScopedSettingsMutationResponse.parse({
    change: { id: row.id, key: row.key, operation, version: row.version },
    reviewedVersion: receipt.expectedVersion,
    current: await scopedReadResponse(tx, { query: receipt.target, actor, event }),
  });
}
