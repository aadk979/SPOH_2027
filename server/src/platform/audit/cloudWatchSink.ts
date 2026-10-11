import {
  CloudWatchLogsClient,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  ResourceAlreadyExistsException,
} from '@aws-sdk/client-cloudwatch-logs';
import { ServiceUnavailableError } from '../errors/index.js';
import { auditRequestBatches, type AuditLogEvent } from './auditLogBatches.js';
export type { AuditLogEvent } from './auditLogBatches.js';

/** Where shipped audit rows go. Tests substitute an in-memory sink. */
export interface AuditSink {
  readonly logGroup: string;
  put(events: readonly AuditLogEvent[]): Promise<void>;
}

/**
 * One stream for the whole trail: the scheduler gives one worker the shipping action
 * at a time, so instances never interleave, and PutLogEvents needs no sequence token.
 */
export const AUDIT_STREAM = 'audit-trail';

export class CloudWatchAuditSink implements AuditSink {
  #streamReady = false;

  constructor(
    readonly logGroup: string,
    private readonly client: Pick<CloudWatchLogsClient, 'send'>,
  ) {}

  async put(events: readonly AuditLogEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.ensureStream();
    for (const logEvents of auditRequestBatches(events)) {
      const result = await this.client.send(
        new PutLogEventsCommand({
          logGroupName: this.logGroup,
          logStreamName: AUDIT_STREAM,
          logEvents,
        }),
      );
      // HTTP 200 can still mean partial delivery. The caller must retain its cursor.
      if (result.rejectedLogEventsInfo) {
        throw new ServiceUnavailableError('CloudWatch rejected audit events');
      }
    }
  }

  private async ensureStream(): Promise<void> {
    if (this.#streamReady) return;
    try {
      await this.client.send(
        new CreateLogStreamCommand({ logGroupName: this.logGroup, logStreamName: AUDIT_STREAM }),
      );
    } catch (error) {
      if (!(error instanceof ResourceAlreadyExistsException)) throw error;
    }
    this.#streamReady = true;
  }
}

export function cloudWatchAuditSink(input: { logGroup: string; region: string }): AuditSink {
  const client = new CloudWatchLogsClient({
    region: input.region,
    maxAttempts: 1,
    // A slow CloudWatch must not hold the shipping transaction to its timeout.
    requestHandler: { requestTimeout: 5_000 },
  });
  return new CloudWatchAuditSink(input.logGroup, client);
}
