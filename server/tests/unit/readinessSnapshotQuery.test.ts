import { expect, it } from 'vitest';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';
import { readinessSnapshot } from '../../src/modules/event/data/readinessSnapshotRepo.js';

it('collects all facts in one bound statement instead of interpolating the event or reading phases', async () => {
  const eventId = "event'; SELECT private_data; --";
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const tx = {
    $queryRaw: async (query: { sql: string; values: unknown[] }) => {
      calls.push(query);
      return [{ snapshot: { eventId } }];
    },
  } as unknown as PrismaTransactionClient;
  expect(await readinessSnapshot(tx, { eventId })).toEqual({ eventId });
  expect(calls).toHaveLength(1);
  expect(calls[0]!.values).toEqual([eventId]);
  expect(calls[0]!.sql).not.toContain(eventId);
  expect(calls[0]!.sql).toContain('gift_adjustments');
  expect(calls[0]!.sql).toContain('gift_redemptions');
  expect(calls[0]!.sql).not.toMatch(/rehearsalInitialStock|shortCode|qrPayload|email|phone/);
});

it('returns missing evidence for an absent selected event, without inventing empty passing facts', async () => {
  const tx = { $queryRaw: async () => [] } as unknown as PrismaTransactionClient;
  expect(await readinessSnapshot(tx, { eventId: 'missing-event' })).toBeNull();
});
