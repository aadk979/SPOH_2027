import type { PrismaTransactionClient } from '../../../platform/db/client.js';

/** Reopening and go-live overrides use current organisation authority, never a token role. */
export async function currentOrganisationRole(
  tx: PrismaTransactionClient,
  input: { organisationId: string; personId: string },
) {
  const { organisationId, personId } = input;
  await tx.$queryRaw`SELECT id FROM "OrganisationMembership"
    WHERE "organisationId" = ${organisationId} AND "personId" = ${personId} FOR SHARE`;
  return tx.organisationMembership.findUnique({
    where: { organisationId_personId: { organisationId, personId } },
    select: { role: true },
  });
}
