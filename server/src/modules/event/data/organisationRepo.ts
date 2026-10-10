import type { PrismaTransactionClient } from '../../../platform/db/client.js';

export async function readOrganisationAuthority(
  tx: PrismaTransactionClient,
  input: { personId: string; organisationId: string },
) {
  const [person, membership, organisation] = await Promise.all([
    tx.person.findUnique({ where: { id: input.personId }, select: { deactivatedAt: true } }),
    tx.organisationMembership.findUnique({
      where: {
        organisationId_personId: { organisationId: input.organisationId, personId: input.personId },
      },
      select: { role: true },
    }),
    tx.organisation.findUnique({ where: { id: input.organisationId }, select: { id: true } }),
  ]);
  return { person, membership, organisation };
}

export async function lockOrganisationAuthority(
  tx: PrismaTransactionClient,
  input: { personId: string; organisationId: string },
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${input.personId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "OrganisationMembership" WHERE "organisationId" = ${input.organisationId} AND "personId" = ${input.personId} FOR SHARE`;
}

export function readOrganisations(tx: PrismaTransactionClient, personId: string) {
  return tx.organisationMembership.findMany({
    where: { personId },
    select: {
      organisation: { select: { id: true, name: true, defaultTimezone: true, locale: true } },
    },
  });
}

export function readAdministrativeEvents(tx: PrismaTransactionClient, organisationIds: string[]) {
  return tx.event.findMany({
    where: { organisationId: { in: organisationIds } },
    select: {
      id: true,
      organisationId: true,
      slug: true,
      name: true,
      venue: true,
      timezone: true,
      locale: true,
      status: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
}
