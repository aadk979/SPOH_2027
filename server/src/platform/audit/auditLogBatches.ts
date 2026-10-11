import { createHash } from 'node:crypto';

export interface AuditLogEvent {
  readonly timestamp: number;
  readonly message: string;
}

const MAX_MESSAGE_BYTES = 200_000;
export const MAX_AUDIT_REQUEST_BYTES = 1_048_576;
const EVENT_OVERHEAD_BYTES = 26;
const MAX_BATCH_EVENTS = 10_000;
const MAX_BATCH_SPAN_MS = 24 * 3600_000;
// Base64 plus the envelope must remain below MAX_MESSAGE_BYTES.
const FRAGMENT_BYTES = 140_000;

/** Lossless fragments carry a content hash and indices for reconstruction and deduplication. */
function fragmentAuditEvent(event: AuditLogEvent): AuditLogEvent[] {
  const bytes = Buffer.from(event.message, 'utf8');
  if (bytes.length <= MAX_MESSAGE_BYTES) return [event];
  const auditMessageSha256 = createHash('sha256').update(bytes).digest('hex');
  const parts = Math.ceil(bytes.length / FRAGMENT_BYTES);
  return Array.from({ length: parts }, (_, index) => ({
    timestamp: event.timestamp,
    message: JSON.stringify({
      auditMessageSha256,
      part: index + 1,
      parts,
      encoding: 'base64',
      data: bytes.subarray(index * FRAGMENT_BYTES, (index + 1) * FRAGMENT_BYTES).toString('base64'),
    }),
  }));
}

/** Account for rendered fragments as well as CloudWatch's per-event byte overhead. */
export function auditEventBytes(event: AuditLogEvent): number {
  return fragmentAuditEvent(event).reduce(
    (sum, fragment) => sum + Buffer.byteLength(fragment.message, 'utf8') + EVENT_OVERHEAD_BYTES,
    0,
  );
}

/** CloudWatch limits requests by UTF-8 bytes, event count and timestamp span. */
export function auditRequestBatches(events: readonly AuditLogEvent[]): AuditLogEvent[][] {
  const batches: AuditLogEvent[][] = [];
  let batch: AuditLogEvent[] = [];
  let bytes = 0;
  for (const event of events.flatMap(fragmentAuditEvent)) {
    const size = Buffer.byteLength(event.message, 'utf8') + EVENT_OVERHEAD_BYTES;
    const first = batch[0];
    if (
      first &&
      (bytes + size > MAX_AUDIT_REQUEST_BYTES ||
        batch.length === MAX_BATCH_EVENTS ||
        event.timestamp - first.timestamp > MAX_BATCH_SPAN_MS)
    ) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(event);
    bytes += size;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}
