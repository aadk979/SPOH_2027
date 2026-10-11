import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuditLogEvent, AuditSink } from '../../src/platform/audit/cloudWatchSink.js';
import {
  auditShippingHandlers,
  shipAuditTrail,
  useAuditSink,
} from '../../src/platform/audit/shipping.js';
import { prisma } from '../../src/platform/db/client.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

/**
 * P08.8 / P15.7: every committed audit row reaches the CloudWatch copy exactly in order,
 * once it has settled, and a failed delivery leaves the cursor where it was.
 */
const ago = (minutes: number) => new Date(FROZEN_NOW.getTime() - minutes * 60_000);

class MemorySink implements AuditSink {
  readonly logGroup = '/spoh/test/audit';
  readonly batches: AuditLogEvent[][] = [];
  failing = false;
  async put(events: readonly AuditLogEvent[]) {
    if (this.failing) throw new Error('CloudWatch unavailable');
    this.batches.push([...events]);
  }
  get ids() {
    return this.batches.flat().map((event) => (JSON.parse(event.message) as { id: string }).id);
  }
}

let sink: MemorySink;
beforeEach(async () => {
  await resetDatabase();
  sink = new MemorySink();
});
afterEach(() => {
  useAuditSink(undefined);
});

async function audit(id: string, createdAt: Date) {
  await rawDb.auditLog.create({
    data: { id, action: 'setting.change', entityType: 'Setting', entityId: null, createdAt },
  });
}
const ship = (now = FROZEN_NOW) => prisma.$transaction((tx) => shipAuditTrail(tx, { sink, now }));
const cursor = () => rawDb.auditShipment.findUnique({ where: { logGroup: sink.logGroup } });

describe('shipping the audit trail', () => {
  it('ships settled rows in (createdAt, id) order and holds back recent ones', async () => {
    await audit('row-c', ago(10));
    await audit('row-a', ago(5));
    await audit('row-b', ago(5));
    await audit('row-recent', ago(1));
    expect(await ship()).toBe(3);
    expect(sink.ids).toEqual(['row-c', 'row-a', 'row-b']);
    expect(await cursor()).toMatchObject({ lastId: 'row-b', lastCreatedAt: ago(5), shipped: 3 });
  });

  it('never ships a row twice and picks up where it stopped', async () => {
    await audit('row-1', ago(10));
    await audit('row-2', ago(1));
    expect(await ship()).toBe(1);
    expect(await ship()).toBe(0);
    expect(await ship(new Date(FROZEN_NOW.getTime() + 5 * 60_000))).toBe(1);
    expect(sink.ids).toEqual(['row-1', 'row-2']);
    expect((await cursor())?.shipped).toBe(2);
  });

  it('keeps the cursor when delivery fails, so the batch goes out on the next run', async () => {
    await audit('row-1', ago(10));
    sink.failing = true;
    await expect(ship()).rejects.toThrow('CloudWatch unavailable');
    expect(await cursor()).toBeNull();
    sink.failing = false;
    expect(await ship()).toBe(1);
  });

  it('carries the whole row, with its id for deduplication', async () => {
    await audit('row-1', ago(10));
    await ship();
    const [event] = sink.batches.flat();
    expect(event!.timestamp).toBe(FROZEN_NOW.getTime());
    expect(JSON.parse(event!.message)).toMatchObject({
      id: 'row-1',
      action: 'setting.change',
      entityType: 'Setting',
      createdAt: ago(10).toISOString(),
    });
  });
});

describe('the scheduled action', () => {
  const registry = new HandlerRegistry(auditShippingHandlers);
  const run = async () => {
    const [claim] = await claimDueActions({
      workerId: 'audit-shipper',
      types: registry.types(),
      clock: fixedClock(FROZEN_NOW),
    });
    return runClaimedAction({ claim: claim!, registry, clock: fixedClock(FROZEN_NOW) });
  };
  const queue = (data = {}) =>
    rawDb.scheduledAction.create({
      data: { type: 'audit.ship', payload: {}, runAt: ago(1), ...data },
    });

  it('ships through the configured sink as a system action', async () => {
    useAuditSink(sink);
    await audit('row-1', ago(10));
    await queue();
    expect(await run()).toBe('SUCCEEDED');
    expect(sink.ids).toEqual(['row-1']);
  });

  it('is a no-op without a configured log group', async () => {
    useAuditSink(null);
    await audit('row-1', ago(10));
    await queue();
    expect(await run()).toBe('SUCCEEDED');
    expect(await cursor()).toBeNull();
  });

  it('refuses to run inside one event', async () => {
    useAuditSink(sink);
    const { eventId } = await testEvent();
    await queue({ eventId });
    expect(await run()).not.toBe('SUCCEEDED');
    expect(sink.batches).toEqual([]);
  });
});
