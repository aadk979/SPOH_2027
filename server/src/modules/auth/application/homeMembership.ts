import { findLiveMemberships, findArchivedAdminMembership } from '../data/repo.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';

/**
 * The membership a session opens in, until the client names its event
 * (P09.8): the person's first active membership of a running event, oldest
 * event first, including CLOSED for reports and late sync; failing that, any membership,
 * so a deactivated account is told so rather than "not provisioned".
 */
export async function homeMembership(personId: string, tx: PrismaTransactionClient = prisma) {
  const memberships = await findLiveMemberships(personId, tx);
  return (
    memberships.find((membership) => membership.status === 'ACTIVE') ??
    memberships.find((membership) => membership.status === 'INVITED') ??
    await findArchivedAdminMembership(personId, tx) ??
    memberships[0] ??
    null
  );
}
