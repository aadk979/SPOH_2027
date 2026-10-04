import type { MediaUrlResponse } from '@spoh/shared';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { assertConfigured, presignRead } from './s3.js';
import { mediaLimits } from './limits.js';
import { requireIssuedMediaKey } from './requireIssuedMediaKey.js';

/** Mint a short-lived URL while current event membership and exact ownership are held. */
export async function readUrl(key: string, actor: ActorContext): Promise<MediaUrlResponse> {
  assertConfigured();
  return prisma.$transaction(
    async (tx) => {
      const event = await holdCaptureEvent(tx, actor.scope);
      await requireCurrentCapability(tx, {
        scope: actor.scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        capability: 'own.read',
      });
      await requireIssuedMediaKey(tx, actor.scope, key);
      const { ttlSeconds } = await mediaLimits(tx, event.organisationId);
      return { url: await presignRead(key, ttlSeconds), expiresIn: ttlSeconds };
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
