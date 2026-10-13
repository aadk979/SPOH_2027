import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Serialize first validation even before its receipt exists; collisions only add harmless waiting. */
export async function lockMediaValidation(tx: PrismaTransactionClient, scope: EventScope, key: string) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`${scope.eventId}:${key}`}, 0))`;
}
export function validatedMedia(tx: PrismaTransactionClient, scope: EventScope, key: string) {
  return tx.validatedMedia.findFirst({ where: { eventId: scope.eventId, key } });
}
export function mediaWasPurged(tx: PrismaTransactionClient, scope: EventScope, issuedAt: Date) {
  return tx.auditLog.findFirst({ where: { eventId: scope.eventId, action: 'media.purge',
    createdAt: { gte: issuedAt } }, select: { id: true } });
}
export function saveValidatedMedia(tx: PrismaTransactionClient, scope: EventScope, input: {
  key: string; issuedByPersonId: string; purpose: string; rehearsal: boolean;
  sourceEtag: string; sourceVersionId: string | null; objectKey: string; objectVersionId: string | null;
  contentType: string; contentLength: number; sha256: string; createdAt: Date;
}) {
  return tx.validatedMedia.create({ data: { ...input, eventId: scope.eventId } });
}
