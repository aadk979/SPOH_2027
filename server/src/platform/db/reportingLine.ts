import { ERROR_CODES } from '@spoh/shared';
import { AppError, NotFoundError } from '../errors/index.js';
import type { PrismaTransactionClient } from './client.js';
import type { EventScope } from './eventScope.js';

/** Reporting graph writers take Event exclusively before any Person or membership locks. */
export async function holdReportingEvent(tx: PrismaTransactionClient, scope: EventScope): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${scope.eventId} FOR UPDATE`;
}

/** Read the complete current chain under its Event fence; a cached preview cannot authorize a link. */
export async function requireReportingLine(tx: PrismaTransactionClient, scope: EventScope,
  input: { personId: string; managerId: string }) {
  const manager = await tx.eventMembership.findFirst({ where: { eventId: scope.eventId,
    personId: input.managerId, status: { in: ['ACTIVE', 'INVITED'] },
    person: { deactivatedAt: null, piiErasedAt: null } }, select: { id: true } });
  if (!manager) throw new NotFoundError('Manager');
  const [result] = await tx.$queryRaw<{ invalid: boolean }[]>`
    WITH RECURSIVE chain AS (
      SELECT id, "personId", "reportsToId", ARRAY[id] AS path, false AS cycle
      FROM "EventMembership" WHERE "eventId" = ${scope.eventId} AND id = ${manager.id}
      UNION ALL
      SELECT m.id, m."personId", m."reportsToId", c.path || m.id, m.id = ANY(c.path)
      FROM "EventMembership" m JOIN chain c ON m.id = c."reportsToId"
      WHERE m."eventId" = ${scope.eventId} AND NOT c.cycle
    ) SELECT bool_or(cycle OR "personId" = ${input.personId}) AS invalid FROM chain`;
  if (result?.invalid) throw new AppError(409, ERROR_CODES.REPORTING_CYCLE,
    'That reporting line would form a loop.');
}
