import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { loadResolvedSetting } from '../../../platform/settings/scopedStore.js';

/** Platform media limits for the organisation that owns this request's event. */
export async function mediaLimits(
  scope: EventScope,
): Promise<{ ttlSeconds: number; maxBytes: number }> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: { organisationId: true },
  });
  const context = { organisationId: event.organisationId };
  const [ttl, size] = await Promise.all([
    loadResolvedSetting('media.uploadTtlSeconds', context),
    loadResolvedSetting('media.maxUploadBytes', context),
  ]);
  return { ttlSeconds: ttl.value as number, maxBytes: size.value as number };
}
