import { z } from 'zod';
import { env } from '../../config/env.js';
import type { PrismaTransactionClient } from '../db/client.js';
import { defineScheduledHandler } from '../scheduler/handler.js';
import { requirePlatformSystemAction } from '../scheduler/systemAuthority.js';
import { cloudWatchAuditSink, type AuditSink } from './cloudWatchSink.js';
import { auditEventBytes, MAX_AUDIT_REQUEST_BYTES } from './auditLogBatches.js';
import {
  advanceShipmentCursor,
  readAuditBatch,
  readShipmentCursor,
  type AuditRow,
} from './shipmentRepo.js';

/**
 * The audit trail and the database share a fate: whatever loses one loses the other,
 * at the moment somebody needs the last ten minutes. So a scheduled action copies each
 * committed row to a CloudWatch log group the app can append to but not change.
 *
 * Rows are read, not pushed from `writeAudit`, so a rolled-back mutation never ships.
 * A row ships only once it is older than `SETTLE_MS`: a transaction stamps `createdAt`
 * when it writes, and one still open must commit before the cursor passes its rows.
 * The scheduler runs one shipping action at a time, and its lease fences a late worker.
 * Delivery is at least once; each message carries the row id for deduplication.
 */
const SETTLE_MS = 2 * 60_000;
const BATCH = 1_000;
const BATCHES_PER_RUN = 5;

let configured: AuditSink | null | undefined;

function currentSink(): AuditSink | null {
  if (configured === undefined) {
    configured = env.AUDIT_LOG_GROUP
      ? cloudWatchAuditSink({ logGroup: env.AUDIT_LOG_GROUP, region: env.AWS_REGION })
      : null;
  }
  return configured;
}

/** Tests replace the CloudWatch client; `null` switches shipping off, `undefined` resets. */
export function useAuditSink(sink: AuditSink | null | undefined): void {
  configured = sink;
}

/** Backfills can predate CloudWatch's 14-day ingestion window; createdAt stays in the payload. */
export function toAuditLogEvent(row: AuditRow, shippedAt: Date) {
  return { timestamp: shippedAt.getTime(), message: JSON.stringify(row) };
}

/** Ordinary batches fit one request; one unusually large row keeps all of its fragments. */
function shipmentBatch(rows: readonly AuditRow[], now: Date): AuditRow[] {
  const selected: AuditRow[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = auditEventBytes(toAuditLogEvent(row, now));
    if (selected.length > 0 && bytes + size > MAX_AUDIT_REQUEST_BYTES) break;
    selected.push(row);
    bytes += size;
    if (bytes >= MAX_AUDIT_REQUEST_BYTES) break;
  }
  return selected;
}

/** Ships up to `BATCHES_PER_RUN` batches; returns how many rows went out. */
export async function shipAuditTrail(
  tx: PrismaTransactionClient,
  input: { sink: AuditSink; now: Date },
): Promise<number> {
  const { sink, now } = input;
  const until = new Date(now.getTime() - SETTLE_MS);
  let after = await readShipmentCursor(tx, sink.logGroup);
  let shipped = 0;
  for (let batch = 0; batch < BATCHES_PER_RUN; batch += 1) {
    const available = await readAuditBatch(tx, { after, until, limit: BATCH });
    const rows = shipmentBatch(available, now);
    const last = rows.at(-1);
    if (!last) break;
    await sink.put(rows.map((row) => toAuditLogEvent(row, now)));
    await advanceShipmentCursor(tx, { logGroup: sink.logGroup, last, count: rows.length });
    after = { lastCreatedAt: last.createdAt, lastId: last.id };
    shipped += rows.length;
    // A single oversized row can need several requests. Leave the next rows for the next tick.
    if (
      (available.length < BATCH && rows.length === available.length) ||
      (rows.length === 1 && auditEventBytes(toAuditLogEvent(last, now)) > MAX_AUDIT_REQUEST_BYTES)
    ) {
      break;
    }
  }
  return shipped;
}

export const auditShippingHandlers = [
  defineScheduledHandler({
    type: 'audit.ship',
    schema: z.object({}).strict(),
    authorize: requirePlatformSystemAction,
    run: async ({ tx, now }) => {
      const sink = currentSink();
      if (sink) await shipAuditTrail(tx, { sink, now });
    },
  }),
];

/** Every five minutes: each run is itself audited, so a shorter interval mostly ships its own noise. */
export const auditShippingRecurringActions = [
  { type: 'audit.ship', intervalSeconds: 300 },
] as const;
