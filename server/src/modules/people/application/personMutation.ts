import { createHash } from 'node:crypto';
import type { IdentityMutationResponse } from '@spoh/shared';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { IdempotencyKeyReuseError } from '../../../platform/errors/index.js';

export interface PersonMutation {
  personId: string;
  actorSub: string;
  operation: string;
  idempotencyKey?: string;
  reason?: string;
}

/** Platform retry receipts carry counts and a request digest, never profile data. */
export async function personMutation(input: PersonMutation,
  execute: (tx: PrismaTransactionClient) => Promise<IdentityMutationResponse>) {
  return prisma.$transaction(async (tx) => {
    const key = input.idempotencyKey;
    if (!key) return execute(tx);
    const endpoint = `person.${input.operation}:${input.personId}`;
    const digest = createHash('sha256').update(JSON.stringify([input.personId, input.operation, input.reason ?? null])).digest('hex');
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const receipt = await tx.idempotencyRecord.findUnique({ where: { key } });
    if (receipt) {
      const stored = receipt.responseBody as IdentityMutationResponse & { digest?: string };
      if (receipt.eventId !== null || receipt.actorSub !== input.actorSub || receipt.endpoint !== endpoint || stored.digest !== digest) throw new IdempotencyKeyReuseError();
      return { identityChanged: stored.identityChanged, sessionsRevoked: stored.sessionsRevoked };
    }
    const result = await execute(tx);
    await tx.idempotencyRecord.create({ data: { key, eventId: null, endpoint,
      actorSub: input.actorSub, statusCode: 200, responseBody: { ...result, digest } } });
    return result;
  }, { timeout: 30_000 });
}
