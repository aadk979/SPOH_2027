import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { mediaUploadReceipt } from '../data/ownershipRepo.js';
import { lockMediaValidation, mediaWasPurged, saveValidatedMedia, validatedMedia } from '../data/validationRepo.js';
import { isReadableKey } from '../domain/mediaKeys.js';
import { MediaValidationIntent } from '../domain/uploadReceipt.js';
import { issuedRehearsal } from '../domain/mediaCaptureMode.js';
import { mediaLimits } from './limits.js';
import { validateUpload } from './s3.js';

/** The original issuance identity stays stable while the served derivative is frozen once. */
export async function validateMedia(tx: PrismaTransactionClient, scope: EventScope, key: string) {
  if (!isReadableKey(key)) throw new NotFoundError('Media object');
  const receipt = await mediaUploadReceipt(tx, scope, key);
  const parsed = MediaValidationIntent.safeParse(receipt?.after);
  const rehearsal = issuedRehearsal(receipt?.after);
  if (!receipt?.actorId || !parsed.success || rehearsal === null) throw new NotFoundError('Media object');
  await lockMediaValidation(tx, scope, key);
  if (await mediaWasPurged(tx, scope, receipt.createdAt)) throw new NotFoundError('Media object');
  const existing = await validatedMedia(tx, scope, key);
  if (existing) return existing;
  const event = await tx.event.findUniqueOrThrow({ where: { id: scope.eventId }, select: { organisationId: true } });
  const { maxBytes } = await mediaLimits(tx, event.organisationId);
  const verified = await validateUpload({ key, eventId: scope.eventId,
    contentType: parsed.data.contentType, contentLength: parsed.data.contentLength, maxBytes });
  return saveValidatedMedia(tx, scope, { key, issuedByPersonId: receipt.actorId,
    purpose: parsed.data.purpose, rehearsal, ...verified, createdAt: systemClock.now() });
}
