import {
  CreateLogStreamCommand,
  PutLogEventsCommand,
  ResourceAlreadyExistsException,
} from '@aws-sdk/client-cloudwatch-logs';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { AUDIT_STREAM, CloudWatchAuditSink } from '../../src/platform/audit/cloudWatchSink.js';

function fakeClient(
  fail?: (command: unknown) => Error | undefined,
  rejectedLogEventsInfo?: {
    tooOldLogEventEndIndex?: number;
    tooNewLogEventStartIndex?: number;
    expiredLogEventEndIndex?: number;
  },
) {
  const sent: unknown[] = [];
  return {
    sent,
    async send(command: unknown) {
      sent.push(command);
      const error = fail?.(command);
      if (error) throw error;
      return command instanceof PutLogEventsCommand ? { rejectedLogEventsInfo } : {};
    },
  };
}

const event = { timestamp: 1, message: '{"id":"a"}' };

describe('the CloudWatch audit sink', () => {
  it('creates its stream once, then only appends', async () => {
    const client = fakeClient();
    const sink = new CloudWatchAuditSink('/spoh/test/audit', client as never);
    await sink.put([event]);
    await sink.put([event]);
    expect(client.sent.map((command) => command?.constructor)).toEqual([
      CreateLogStreamCommand,
      PutLogEventsCommand,
      PutLogEventsCommand,
    ]);
    expect((client.sent[1] as PutLogEventsCommand).input).toEqual({
      logGroupName: '/spoh/test/audit',
      logStreamName: AUDIT_STREAM,
      logEvents: [event],
    });
  });

  it('accepts a stream another instance already created', async () => {
    const client = fakeClient((command) =>
      command instanceof CreateLogStreamCommand
        ? new ResourceAlreadyExistsException({ message: 'exists', $metadata: {} })
        : undefined,
    );
    const sink = new CloudWatchAuditSink('/spoh/test/audit', client as never);
    await expect(sink.put([event])).resolves.toBeUndefined();
  });

  it('fails the delivery on any other error', async () => {
    const client = fakeClient((command) =>
      command instanceof PutLogEventsCommand ? new Error('throttled') : undefined,
    );
    const sink = new CloudWatchAuditSink('/spoh/test/audit', client as never);
    await expect(sink.put([event])).rejects.toThrow('throttled');
  });

  it('sends nothing for an empty batch', async () => {
    const client = fakeClient();
    await new CloudWatchAuditSink('/g', client as never).put([]);
    expect(client.sent).toEqual([]);
  });

  it('preserves oversized Unicode audit rows as reconstructable fragments', async () => {
    const client = fakeClient();
    const message = JSON.stringify({ id: 'large-row', after: '😀'.repeat(100_000) });
    await new CloudWatchAuditSink('/g', client as never).put([{ ...event, message }]);
    const fragments = client.sent
      .filter((command): command is PutLogEventsCommand => command instanceof PutLogEventsCommand)
      .flatMap((command) => command.input.logEvents!)
      .map((item) => {
        expect(Buffer.byteLength(item.message!)).toBeLessThanOrEqual(200_000);
        return JSON.parse(item.message!) as {
          auditMessageSha256: string;
          part: number;
          parts: number;
          encoding: string;
          data: string;
        };
      });
    expect(fragments).toHaveLength(3);
    const digest = createHash('sha256').update(message).digest('hex');
    expect(fragments.map(({ part }) => part)).toEqual([1, 2, 3]);
    for (const fragment of fragments) {
      expect(fragment).toMatchObject({ auditMessageSha256: digest, parts: 3, encoding: 'base64' });
    }
    const reconstructed = Buffer.concat(fragments.map(({ data }) => Buffer.from(data, 'base64')));
    expect(reconstructed.toString('utf8')).toBe(message);
  });

  it('splits by UTF-8 bytes and per-event overhead without losing rows', async () => {
    const client = fakeClient();
    const events = Array.from({ length: 12 }, (_, index) => ({
      timestamp: index,
      message: 'é'.repeat(100_000),
    }));
    await new CloudWatchAuditSink('/g', client as never).put(events);
    const batches = client.sent
      .filter((command): command is PutLogEventsCommand => command instanceof PutLogEventsCommand)
      .map((command) => command.input.logEvents!);
    expect(batches).toHaveLength(3);
    expect(batches.flat()).toEqual(events);
    for (const batch of batches) {
      const bytes = batch.reduce((sum, item) => sum + Buffer.byteLength(item.message!) + 26, 0);
      expect(bytes).toBeLessThanOrEqual(1_048_576);
    }
  });

  it('splits a backfill at the 24-hour request span', async () => {
    const client = fakeClient();
    const events = [event, { ...event, timestamp: event.timestamp + 86_400_001 }];
    await new CloudWatchAuditSink('/g', client as never).put(events);
    const puts = client.sent.filter(
      (command): command is PutLogEventsCommand => command instanceof PutLogEventsCommand,
    );
    expect(puts.map((command) => command.input.logEvents)).toEqual([[events[0]], [events[1]]]);
  });

  it.each([
    { tooOldLogEventEndIndex: 0 },
    { tooNewLogEventStartIndex: 0 },
    { expiredLogEventEndIndex: 0 },
  ])(
    'refuses to acknowledge rows CloudWatch rejected despite an HTTP 200: %o',
    async (rejected) => {
      const client = fakeClient(undefined, rejected);
      await expect(new CloudWatchAuditSink('/g', client as never).put([event])).rejects.toThrow(
        'CloudWatch rejected audit events',
      );
    },
  );
});
