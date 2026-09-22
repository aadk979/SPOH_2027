import { hostname } from 'node:os';
import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  DataAlreadyAcceptedException,
  InvalidSequenceTokenException,
  PutLogEventsCommand,
  PutRetentionPolicyCommand,
  ResourceAlreadyExistsException,
  ResourceNotFoundException,
} from '@aws-sdk/client-cloudwatch-logs';
import { env } from '../config/env.js';

/**
 * CloudWatch Logs delivery (BUILD_PLAN §8.7).
 *
 * The box is one t3.micro. If it dies, its journal dies with it — which is
 * exactly the moment somebody wants to know what the last ten minutes looked
 * like. So the audit trail goes to a log group as well as to Postgres, and the
 * two failure modes stop being the same failure mode.
 *
 * Three rules this module does not break:
 *
 *  1. **Delivery never fails a request.** Every entry point returns void and
 *     swallows its own errors. An audit row that is already committed to
 *     Postgres must not be un-committed because AWS had a bad second.
 *  2. **Memory is bounded.** If delivery is failing, the buffer fills to a hard
 *     ceiling and then drops the *oldest* events, counting them. An unbounded
 *     retry queue on a 1 GB box is how a logging change takes the event down.
 *  3. **Unconfigured is off, not broken.** No log group means every call here
 *     is a no-op, which is the correct behaviour on a developer laptop.
 *
 * Ordering note: PutLogEvents has not required sequence tokens since 2023, but
 * it still rejects a batch whose events are not in chronological order, so the
 * batch is sorted before it is sent.
 */

/** CloudWatch's own limits. Batches are built to stay inside them. */
const MAX_BATCH_EVENTS = 1_000;
const MAX_BATCH_BYTES = 1_000_000;
/** Each event costs 26 bytes of overhead on top of its UTF-8 message. */
const EVENT_OVERHEAD_BYTES = 26;
/** A single event larger than this is truncated rather than rejected forever. */
const MAX_EVENT_BYTES = 250_000;

/** How long an event may wait before it is worth a round trip on its own. */
const FLUSH_INTERVAL_MS = 2_000;
/** Ceiling on the in-memory queue, per stream. Oldest are dropped past this. */
const MAX_BUFFERED_EVENTS = 10_000;

/** Backoff after a failed delivery, so a broken endpoint is not hammered. */
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 60_000;

export interface CloudWatchStatus {
  enabled: boolean;
  logGroup: string | null;
  auditLogGroup: string | null;
  region: string | null;
  delivered: number;
  dropped: number;
  lastError: string | null;
  lastDeliveryAt: Date | null;
}

interface LogEvent {
  timestamp: number;
  message: string;
}

const status = {
  delivered: 0,
  dropped: 0,
  lastError: null as string | null,
  lastDeliveryAt: null as Date | null,
};

/**
 * One stream per log group per process.
 *
 * The stream name carries the host and the boot time, so two instances behind
 * a load balancer never interleave into one stream — which would make the
 * ordering requirement above unsatisfiable.
 */
const STREAM_NAME = `${hostname()}-${process.pid}-${new Date().toISOString().replace(/[:.]/g, '-')}`;

const client: CloudWatchLogsClient | null =
  env.CLOUDWATCH_LOG_GROUP || env.CLOUDWATCH_AUDIT_LOG_GROUP
    ? new CloudWatchLogsClient({ region: env.CLOUDWATCH_REGION ?? env.AWS_REGION })
    : null;

class LogStream {
  private readonly buffer: LogEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private ensured = false;
  private inFlight = false;
  private retryDelay = RETRY_BASE_MS;

  constructor(private readonly logGroup: string) {}

  /** Queue an event. Returns immediately; delivery happens on the timer. */
  push(timestamp: number, message: string): void {
    if (!client) return;

    const truncated =
      Buffer.byteLength(message, 'utf8') > MAX_EVENT_BYTES
        ? `${message.slice(0, MAX_EVENT_BYTES / 2)}…[truncated]`
        : message;

    this.buffer.push({ timestamp, message: truncated });

    // Drop the oldest rather than the newest: during an incident the recent
    // events are the ones somebody is waiting to read.
    while (this.buffer.length > MAX_BUFFERED_EVENTS) {
      this.buffer.shift();
      status.dropped += 1;
    }

    this.schedule(FLUSH_INTERVAL_MS);
  }

  private schedule(delay: number): void {
    if (this.timer || this.inFlight || this.buffer.length === 0) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
    // Never hold the process open for a log flush.
    this.timer.unref?.();
  }

  /**
   * Deliver one batch. Called on the timer and once on shutdown.
   *
   * Failures put the events back at the front of the queue and back off; they
   * are not thrown, because there is nobody above this who could act on them.
   */
  async flush(): Promise<void> {
    if (!client || this.inFlight || this.buffer.length === 0) return;

    this.inFlight = true;
    const batch = this.take();

    try {
      await this.ensureStream();
      await client.send(
        new PutLogEventsCommand({
          logGroupName: this.logGroup,
          logStreamName: STREAM_NAME,
          logEvents: batch,
        }),
      );

      status.delivered += batch.length;
      status.lastDeliveryAt = new Date();
      status.lastError = null;
      this.retryDelay = RETRY_BASE_MS;
    } catch (error) {
      // Both mean the batch landed, or would land identically on a retry.
      if (
        error instanceof DataAlreadyAcceptedException ||
        error instanceof InvalidSequenceTokenException
      ) {
        status.delivered += batch.length;
        this.retryDelay = RETRY_BASE_MS;
      } else {
        if (error instanceof ResourceNotFoundException) this.ensured = false;

        status.lastError = error instanceof Error ? error.message : String(error);
        this.buffer.unshift(...batch);
        while (this.buffer.length > MAX_BUFFERED_EVENTS) {
          this.buffer.pop();
          status.dropped += 1;
        }
        this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
      }
    } finally {
      this.inFlight = false;
      this.schedule(status.lastError ? this.retryDelay : FLUSH_INTERVAL_MS);
    }
  }

  /** Pull the largest batch that fits CloudWatch's limits, in time order. */
  private take(): LogEvent[] {
    this.buffer.sort((a, b) => a.timestamp - b.timestamp);

    const batch: LogEvent[] = [];
    let bytes = 0;

    while (this.buffer.length > 0 && batch.length < MAX_BATCH_EVENTS) {
      const next = this.buffer[0] as LogEvent;
      const cost = Buffer.byteLength(next.message, 'utf8') + EVENT_OVERHEAD_BYTES;
      if (bytes + cost > MAX_BATCH_BYTES && batch.length > 0) break;

      bytes += cost;
      batch.push(next);
      this.buffer.shift();
    }

    return batch;
  }

  /**
   * Create the group and stream if they are not there yet.
   *
   * Done lazily on first delivery rather than at boot, so a server with no
   * CloudWatch permissions still starts — it just logs locally.
   */
  private async ensureStream(): Promise<void> {
    if (!client || this.ensured) return;

    try {
      await client.send(new CreateLogGroupCommand({ logGroupName: this.logGroup }));
      if (env.CLOUDWATCH_RETENTION_DAYS) {
        await client.send(
          new PutRetentionPolicyCommand({
            logGroupName: this.logGroup,
            retentionInDays: env.CLOUDWATCH_RETENTION_DAYS,
          }),
        );
      }
    } catch (error) {
      if (!(error instanceof ResourceAlreadyExistsException)) throw error;
    }

    try {
      await client.send(
        new CreateLogStreamCommand({
          logGroupName: this.logGroup,
          logStreamName: STREAM_NAME,
        }),
      );
    } catch (error) {
      if (!(error instanceof ResourceAlreadyExistsException)) throw error;
    }

    this.ensured = true;
  }
}

const applicationStream = env.CLOUDWATCH_LOG_GROUP ? new LogStream(env.CLOUDWATCH_LOG_GROUP) : null;

/**
 * The audit stream, which defaults to the application group.
 *
 * Splitting them is worth it in production: the audit group can carry a long
 * retention and a tight resource policy without paying to keep every request
 * line for the same year.
 */
const auditStream = env.CLOUDWATCH_AUDIT_LOG_GROUP
  ? new LogStream(env.CLOUDWATCH_AUDIT_LOG_GROUP)
  : applicationStream;

export const cloudWatchEnabled = client !== null;

/** Ship one already-serialised application log line. */
export function shipLogLine(line: string): void {
  applicationStream?.push(Date.now(), line);
}

/** Ship one audit record. Serialised here so callers stay free of the shape. */
export function shipAuditEvent(event: Record<string, unknown>): void {
  if (!auditStream) return;

  const timestamp = typeof event.createdAt === 'string' ? Date.parse(event.createdAt) : Number.NaN;

  auditStream.push(Number.isFinite(timestamp) ? timestamp : Date.now(), JSON.stringify(event));
}

export function cloudWatchStatus(): CloudWatchStatus {
  return {
    enabled: cloudWatchEnabled,
    logGroup: env.CLOUDWATCH_LOG_GROUP ?? null,
    auditLogGroup: env.CLOUDWATCH_AUDIT_LOG_GROUP ?? env.CLOUDWATCH_LOG_GROUP ?? null,
    region: cloudWatchEnabled ? (env.CLOUDWATCH_REGION ?? env.AWS_REGION) : null,
    ...status,
  };
}

/**
 * Best-effort drain on shutdown.
 *
 * Bounded, because a deploy that hangs waiting for a log flush is worse than
 * a deploy that loses the last two seconds of one.
 */
export async function flushCloudWatch(timeoutMs = 3_000): Promise<void> {
  if (!client) return;

  const streams = new Set([applicationStream, auditStream].filter(Boolean) as LogStream[]);

  await Promise.race([
    Promise.allSettled([...streams].map((stream) => stream.flush())),
    new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      timer.unref?.();
    }),
  ]);
}
