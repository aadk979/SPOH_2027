import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { mediaUploadReceipt } from '../data/ownershipRepo.js';
import { isReadableKey } from '../domain/mediaKeys.js';

/** An opaque key is neither authority to read it nor authority to attach it. */
export async function requireIssuedMediaKey(
  tx: PrismaTransactionClient,
  scope: EventScope,
  key: string,
): Promise<void> {
  if (!isReadableKey(key) || !(await mediaUploadReceipt(tx, scope, key)))
    throw new NotFoundError('Media object');
}
