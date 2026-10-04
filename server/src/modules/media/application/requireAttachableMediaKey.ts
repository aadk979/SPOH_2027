import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import {
  assertCaptureMode,
  type CaptureModeScope,
} from '../../../platform/db/captureProvenance.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { mediaUploadReceipt } from '../data/ownershipRepo.js';
import { isReadableKey } from '../domain/mediaKeys.js';
import { issuedRehearsal } from '../domain/mediaCaptureMode.js';

/** A new item cannot promote a practice photo or relabel a live photo as practice. */
export async function requireAttachableMediaKey(
  tx: PrismaTransactionClient,
  scope: CaptureModeScope,
  key: string,
): Promise<void> {
  if (!isReadableKey(key)) throw new NotFoundError('Media object');
  const receipt = await mediaUploadReceipt(tx, scope, key);
  const rehearsal = issuedRehearsal(receipt?.after);
  if (rehearsal === null) throw new NotFoundError('Media object');
  assertCaptureMode(scope.rehearsal, { rehearsal });
}
