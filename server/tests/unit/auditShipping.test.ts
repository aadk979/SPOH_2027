import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auditRequestBatches } from '../../src/platform/audit/auditLogBatches.js';
import type { AuditLogEvent, AuditSink } from '../../src/platform/audit/cloudWatchSink.js';
import { shipAuditTrail, toAuditLogEvent } from '../../src/platform/audit/shipping.js';
import type { AuditRow } from '../../src/platform/audit/shipmentRepo.js';

const repos = vi.hoisted(() => ({
  readShipmentCursor: vi.fn(),
  readAuditBatch: vi.fn(),
  advanceShipmentCursor: vi.fn(),
}));
vi.mock('../../src/platform/audit/shipmentRepo.js', () => repos);
vi.mock('../../src/config/env.js', () => ({ env: {} }));

const now = new Date('2026-10-11T00:00:00Z');
const old = new Date('2025-10-11T00:00:00Z');
const row = (id: string, after: string | null = null): AuditRow => ({
  id,
  action: 'setting.change',
  entityType: 'Setting',
  createdAt: old,
  after,
  eventId: null,
  actorId: null,
  membershipId: null,
  actorSub: null,
  severity: 'INFO',
  outcome: 'SUCCESS',
  source: 'USER',
  scheduledActionId: null,
  entityId: null,
  before: null,
  method: null,
  path: null,
  statusCode: null,
  ip: null,
  userAgent: null,
  requestId: null,
});

function batchSource(rows: AuditRow[]) {
  repos.readAuditBatch.mockImplementation((_tx, input: { after: { lastId: string } }) =>
    Promise.resolve(rows.filter((item) => item.id > input.after.lastId)),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  repos.readShipmentCursor.mockResolvedValue({ lastCreatedAt: new Date(0), lastId: '' });
});

describe('bounded audit shipments', () => {
  it('uses the shipment clock for old history while preserving its original timestamp', () => {
    const event = toAuditLogEvent(row('old-row'), now);
    expect(event.timestamp).toBe(now.getTime());
    expect(JSON.parse(event.message)).toMatchObject({
      id: 'old-row',
      createdAt: old.toISOString(),
    });
  });

  it('limits ordinary sends by rendered fragment bytes before advancing each cursor', async () => {
    batchSource(
      Array.from({ length: 12 }, (_, i) =>
        row(`row-${String(i).padStart(2, '0')}`, 'x'.repeat(200_000)),
      ),
    );
    const sent: (readonly AuditLogEvent[])[] = [];
    const sink: AuditSink = {
      logGroup: '/g',
      put: async (events) => {
        sent.push(events);
      },
    };
    expect(await shipAuditTrail({} as never, { sink, now })).toBe(12);
    expect(sent).toHaveLength(4);
    for (const events of sent) expect(auditRequestBatches(events)).toHaveLength(1);
    expect(repos.advanceShipmentCursor).toHaveBeenLastCalledWith(
      {},
      expect.objectContaining({
        last: expect.objectContaining({ id: 'row-11' }),
      }),
    );
  });

  it('preserves a single oversized row and leaves the next row for the next run', async () => {
    batchSource([row('row-00', 'x'.repeat(2_000_000)), row('row-01')]);
    const put = vi.fn<(events: readonly AuditLogEvent[]) => Promise<void>>().mockResolvedValue();
    expect(await shipAuditTrail({} as never, { sink: { logGroup: '/g', put }, now })).toBe(1);
    expect(put).toHaveBeenCalledOnce();
    expect(auditRequestBatches(put.mock.calls[0]![0]).length).toBeGreaterThan(1);
    expect(repos.advanceShipmentCursor).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        last: expect.objectContaining({ id: 'row-00' }),
        count: 1,
      }),
    );
  });

  it('does not advance the cursor after a rejected shipment', async () => {
    batchSource([row('row-00')]);
    const put = vi.fn().mockRejectedValue(new Error('CloudWatch rejected audit events'));
    await expect(
      shipAuditTrail({} as never, { sink: { logGroup: '/g', put }, now }),
    ).rejects.toThrow('CloudWatch rejected');
    expect(repos.advanceShipmentCursor).not.toHaveBeenCalled();
  });
});
