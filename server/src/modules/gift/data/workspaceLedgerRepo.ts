import type { ReadDatabase } from '../../../platform/db/readDatabase.js';
import { Prisma } from '../../../generated/prisma/client.js';

interface LedgerQuery { giftTypeId: string; rehearsal: boolean; time: { gte?: Date; lt?: Date; lte: Date }; cursor?: string; limit: number }
interface LedgerRow { id: string; recordId: string; at: Date; delta: number; kind: 'adjustment' | 'redemption'; reason: string | null; actorId: string; voided: boolean; stationId: string | null }
function ledgerQuery(context: ReadDatabase, input: LedgerQuery) {
  const { giftTypeId, rehearsal, time } = input;
  const adjustmentFrom = time.gte ? Prisma.sql`AND "createdAt" >= ${time.gte}` : Prisma.empty;
  const adjustmentTo = time.lt ? Prisma.sql`AND "createdAt" < ${time.lt}` : Prisma.empty;
  const redemptionFrom = time.gte ? Prisma.sql`AND "recordedAt" >= ${time.gte}` : Prisma.empty;
  const redemptionTo = time.lt ? Prisma.sql`AND "recordedAt" < ${time.lt}` : Prisma.empty;
  return Prisma.sql`
    SELECT 'adjustment:' || id AS id, id AS "recordId", "createdAt" AS at, delta, 'adjustment'::text AS kind, reason, "createdById" AS "actorId", false AS voided, NULL::text AS "stationId"
    FROM "GiftStockAdjustment" WHERE "eventId" = ${context.scope.eventId} AND "giftTypeId" = ${giftTypeId}
      AND rehearsal = ${rehearsal} ${adjustmentFrom} ${adjustmentTo} AND "createdAt" <= ${time.lte}
    UNION ALL
    SELECT 'redemption:' || id AS id, id AS "recordId", "recordedAt" AS at, CASE WHEN voided THEN 0 ELSE -1 END AS delta, 'redemption'::text AS kind,
      "voidedReason" AS reason, "recordedById" AS "actorId", voided, "stationId"
    FROM "GiftRedemption" WHERE "eventId" = ${context.scope.eventId} AND "giftTypeId" = ${giftTypeId}
      AND rehearsal = ${rehearsal} ${redemptionFrom} ${redemptionTo} AND "recordedAt" <= ${time.lte}
    `;
}
export async function workspaceGiftLedger(context: ReadDatabase, input: LedgerQuery) {
  const query = ledgerQuery(context, input);
  const [anchor] = input.cursor ? await context.db.$queryRaw<LedgerRow[]>`
    WITH ledger AS (${query}) SELECT * FROM ledger WHERE id = ${input.cursor}` : [];
  const cursor = anchor ? Prisma.sql`WHERE at < ${anchor.at} OR (at = ${anchor.at} AND id < ${anchor.id})` : Prisma.empty;
  const totals = await (context.db.$queryRaw<Array<{ count: bigint; value: bigint }>>`
      WITH ledger AS (${query}) SELECT COUNT(*)::bigint AS count, COALESCE(SUM(delta), 0)::bigint AS value FROM ledger`);
  const rows = await (context.db.$queryRaw<LedgerRow[]>`WITH ledger AS (${query}) SELECT * FROM ledger ${cursor}
      ORDER BY at DESC, id DESC LIMIT ${input.limit + 1}`);
  return { count: Number(totals[0]?.count ?? 0), value: Number(totals[0]?.value ?? 0), rows, cursorValid: !input.cursor || !!anchor };
}
