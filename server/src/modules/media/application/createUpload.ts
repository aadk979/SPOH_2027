import { randomUUID } from 'node:crypto';
import type { CreateUploadRequest, CreateUploadResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { admittedCaptureTime } from '../../../platform/db/captureAdmission.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { ValidationError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { buildKey } from '../domain/mediaKeys.js';
import { assertConfigured, presignUpload } from './s3.js';
import { mediaLimits } from './limits.js';

/**
 * Sign an upload policy. The file never passes through the API: the client
 * uploads straight to S3 with this policy and sends back the key.
 */
export async function createUpload(
  request: CreateUploadRequest,
  actor: ActorContext,
  clock: Clock = systemClock,
): Promise<CreateUploadResponse> {
  assertConfigured();
  return prisma.$transaction((tx) => issueUpload(tx, { request, actor, clock }), {
    isolationLevel: 'ReadCommitted',
    timeout: 30_000,
  });
}

/** Signing and its audit commit while event phase and current membership remain held. */
async function issueUpload(
  tx: PrismaTransactionClient,
  { request, actor, clock }: { request: CreateUploadRequest; actor: ActorContext; clock: Clock },
): Promise<CreateUploadResponse> {
  const { scope, audit } = actor;
  const event = await holdCaptureEvent(tx, scope);
  await requireCurrentCapability(tx, {
    scope,
    membershipId: actor.membershipId,
    personId: actor.volunteerId,
    capability: 'lostFound.log',
  });
  // New photos are online captures; a pre-close offline timestamp cannot admit a new upload.
  const now = clock.now();
  admittedCaptureTime({ ...event, now, graceHours: 0 });
  const { maxBytes, ttlSeconds } = await mediaLimits(tx, event.organisationId);

  if (request.contentLength > maxBytes) {
    throw new ValidationError('That photo is too large. Take a smaller one.', {
      field: 'contentLength',
      maxBytes,
    });
  }

  const key = buildKey(request, now, randomUUID());
  const { url, fields } = await presignUpload({
    key,
    contentType: request.contentType,
    maxBytes,
    ttlSeconds,
  });

  // Audited when the policy is issued: that is the moment someone was allowed
  // to put an object in the bucket, and the key is how to find it (F03-018).
  await writeAudit(tx, {
    ...audit,
    eventId: scope.eventId,
    action: 'media.upload',
    entityType: 'MediaObject',
    entityId: key,
    after: {
      purpose: request.purpose,
      contentType: request.contentType,
      rehearsal: event.status === 'REHEARSAL',
    },
  });

  return { url, fields, key, expiresIn: ttlSeconds, maxBytes };
}
