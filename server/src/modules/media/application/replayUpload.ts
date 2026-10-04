import type { CreateUploadRequest, CreateUploadResponse } from '@spoh/shared';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { assertCaptureMode } from '../../../platform/db/captureProvenance.js';
import { IdempotencyKeyReuseError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { uploadIntentForReplay } from '../data/uploadReplayRepo.js';
import { isReadableKey } from '../domain/mediaKeys.js';
import { MediaUploadAuditIntent } from '../domain/uploadReceipt.js';
import { assertConfigured, presignUpload } from './s3.js';
import { holdUploadAuthority, resolveUploadPolicy } from './uploadAdmission.js';

/** A receipt can reissue a policy only under the issuer's current capture authority. */
export async function replayUpload(
  input: { key: string; request: CreateUploadRequest; actor: ActorContext },
  clock: Clock = systemClock,
): Promise<CreateUploadResponse> {
  assertConfigured();
  return prisma.$transaction((tx) => reissuePolicy(tx, { ...input, clock }), {
    isolationLevel: 'ReadCommitted',
    timeout: 30_000,
  });
}

async function reissuePolicy(
  tx: PrismaTransactionClient,
  {
    key,
    request,
    actor,
    clock,
  }: {
    key: string;
    request: CreateUploadRequest;
    actor: ActorContext;
    clock: Clock;
  },
): Promise<CreateUploadResponse> {
  const event = await holdUploadAuthority(tx, actor);
  const receipt = await uploadIntentForReplay(actor.scope, tx, {
    key,
    personId: actor.volunteerId,
  });
  const parsed = MediaUploadAuditIntent.safeParse(receipt?.after);
  if (!isReadableKey(key) || !parsed.success) throw new NotFoundError('Media object');
  const intent = parsed.data;
  if (
    intent.purpose !== request.purpose ||
    intent.contentType !== request.contentType ||
    intent.contentLength !== request.contentLength
  )
    throw new IdempotencyKeyReuseError();
  assertCaptureMode(event.status === 'REHEARSAL', intent);
  const { maxBytes, ttlSeconds } = await resolveUploadPolicy(tx, {
    event,
    contentLength: request.contentLength,
    clock,
  });
  const { url, fields } = await presignUpload({
    key,
    contentType: intent.contentType,
    maxBytes,
    ttlSeconds,
  });
  return { key, url, fields, maxBytes, expiresIn: ttlSeconds };
}
