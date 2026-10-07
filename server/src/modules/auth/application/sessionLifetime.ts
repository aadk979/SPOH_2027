import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { SETTINGS } from '../../../platform/settings/registry.js';
import { loadResolvedSetting } from '../../../platform/settings/scopedStore.js';

/**
 * How many days a refresh session lives: the organisation-wide setting of the
 * person's home event (platform scope, D-17), or the registry default. Like the
 * access-token lifetime in issueSession, it is read when the session is opened
 * or rotated, so a change applies to new sessions.
 */
export async function refreshSessionDays(scope: EventScope): Promise<number> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: { organisationId: true },
  });
  const resolved = await loadResolvedSetting('refreshSessionDays', {
    organisationId: event.organisationId,
  });
  return SETTINGS.refreshSessionDays.schema.parse(resolved.value);
}
