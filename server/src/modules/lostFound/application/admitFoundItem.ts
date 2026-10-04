import type { CreateLostFoundRequest } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { admitCapture } from '../../../platform/db/captureAdmission.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import type { Clock } from '../../../platform/time/index.js';
import { requireAttachableMediaKey } from '../../media/index.js';

/** Admission samples time only after event and exact member locks; photo mode shares them. */
export async function admitFoundItem(
  tx: PrismaTransactionClient,
  input: {
    request: CreateLostFoundRequest;
    actor: Pick<ActorContext, 'scope' | 'membershipId' | 'volunteerId'>;
    clock: Clock;
  },
): Promise<void> {
  const { request, actor, clock } = input;
  const { scope, membershipId, volunteerId } = actor;
  await holdCaptureEvent(tx, scope);
  await requireCurrentCapability(tx, {
    scope,
    membershipId,
    personId: volunteerId,
    capability: 'lostFound.log',
  });
  const { rehearsal } = await admitCapture(tx, scope, { request, clock });
  if (request.photoKey !== undefined)
    await requireAttachableMediaKey(tx, { ...scope, rehearsal }, request.photoKey);
}
