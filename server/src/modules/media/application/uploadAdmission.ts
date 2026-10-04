import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { admittedCaptureTime } from '../../../platform/db/captureAdmission.js';
import { holdCaptureEvent, type CaptureEvent } from '../../../platform/db/captureProvenance.js';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { ValidationError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import type { Clock } from '../../../platform/time/index.js';
import { mediaLimits } from './limits.js';

/** Both fresh issuance and replay hold event state and the exact current member. */
export async function holdUploadAuthority(tx: PrismaTransactionClient, actor: ActorContext) {
  const event = await holdCaptureEvent(tx, actor.scope);
  await requireCurrentCapability(tx, {
    scope: actor.scope,
    membershipId: actor.membershipId,
    personId: actor.volunteerId,
    capability: 'lostFound.log',
  });
  return event;
}

/** Sample receipt time after the caller's locks, with current bounded platform limits. */
export async function resolveUploadPolicy(
  tx: PrismaTransactionClient,
  { event, contentLength, clock }: { event: CaptureEvent; contentLength: number; clock: Clock },
) {
  const now = clock.now();
  admittedCaptureTime({ ...event, now, graceHours: 0 });
  const limits = await mediaLimits(tx, event.organisationId);
  if (contentLength > limits.maxBytes)
    throw new ValidationError('That photo is too large. Take a smaller one.', {
      field: 'contentLength',
      maxBytes: limits.maxBytes,
    });
  return { now, ...limits };
}
