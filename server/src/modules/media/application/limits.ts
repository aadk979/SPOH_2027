import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { loadResolvedSetting } from '../../../platform/settings/scopedStore.js';

/** Platform media limits for the organisation that owns this request's event. */
export async function mediaLimits(
  tx: PrismaTransactionClient,
  organisationId: string,
): Promise<{ ttlSeconds: number; maxBytes: number }> {
  const context = { organisationId };
  const ttl = await loadResolvedSetting('media.uploadTtlSeconds', context, tx);
  const size = await loadResolvedSetting('media.maxUploadBytes', context, tx);
  return { ttlSeconds: ttl.value as number, maxBytes: size.value as number };
}
