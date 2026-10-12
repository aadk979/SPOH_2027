import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { BrandingRegistry } from '../domain/registry.js';

export async function lockBrandingEvent(scope: EventScope, tx: PrismaTransactionClient) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${scope.eventId} FOR UPDATE`;
  return eventBranding(scope, tx);
}
export const eventBranding = (scope: EventScope, tx: Pick<PrismaTransactionClient, 'event'> = prisma) =>
  tx.event.findUniqueOrThrow({ where: { id: scope.eventId }, select: { id: true, slug: true, name: true, status: true, branding: true } });
/** Slugs are organisation-unique, so exact public resolution must reject two candidates. */
export const publicCandidates = (slug: string) => prisma.event.findMany({
  where: { slug }, take: 2, select: { id: true, slug: true, name: true, branding: true },
});
export const saveBranding = (scope: EventScope, input: { tx: PrismaTransactionClient; registry: BrandingRegistry }) =>
  input.tx.event.update({ where: { id: scope.eventId }, data: { branding: input.registry as Prisma.InputJsonValue } });
export const insertUpload = (scope: EventScope, input: { tx: PrismaTransactionClient; id: string; key: string; contentType: string; contentLength: number; personId: string; now: Date }) =>
  input.tx.contentUploadReceipt.create({ data: { eventId: scope.eventId, id: input.id, key: input.key, contentType: input.contentType, contentLength: input.contentLength, issuedByPersonId: input.personId, createdAt: input.now } });
export const ownedUpload = (scope: EventScope, input: { tx: PrismaTransactionClient; id: string; personId: string }) =>
  input.tx.contentUploadReceipt.findFirst({ where: { eventId: scope.eventId, id: input.id, issuedByPersonId: input.personId } });
