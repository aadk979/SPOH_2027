import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { SessionScope } from '../domain/sessionScope.js';
import { sessionOrganisation } from './sessionOrganisation.js';
import { SETTINGS } from '../../../platform/settings/registry.js';
import { loadResolvedSetting } from '../../../platform/settings/scopedStore.js';

/**
 * How many days a refresh session lives: the organisation-wide setting of the
 * person's home event (platform scope, D-17), or the registry default. Like the
 * access-token lifetime in issueSession, it is read when the session is opened
 * for new families. Rotation preserves the original boundary; 30 days is the
 * absolute ceiling even when the configured value is higher.
 */
export async function refreshSessionDays(scope: SessionScope, tx: PrismaTransactionClient = prisma): Promise<number> {
  const organisationId = await sessionOrganisation(scope, tx);
  const resolved = await loadResolvedSetting('refreshSessionDays', {
    organisationId,
  }, tx);
  return SETTINGS.refreshSessionDays.schema.parse(resolved.value);
}
