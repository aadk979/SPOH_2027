import type { Action } from '@spoh/access-policies';
import { requireCurrentOrganisationPermission } from '../../../platform/access/currentOrganisation.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { ForbiddenError } from '../../../platform/errors/index.js';

/** Organisation actions work even before the organisation has its first event. */
export async function organisationAuthority(
  tx: PrismaTransactionClient,
  input: { personId: string; organisationId: string; action: Action; subject?: string },
): Promise<boolean> {
  try {
    await requireCurrentOrganisationPermission(tx, input);
    return true;
  } catch (error) {
    if (error instanceof ForbiddenError) return false;
    throw error;
  }
}

export async function requireOrganisationAuthority(
  tx: PrismaTransactionClient,
  input: { personId: string; organisationId: string; action: Action; subject?: string },
): Promise<void> {
  await requireCurrentOrganisationPermission(tx, input);
}
