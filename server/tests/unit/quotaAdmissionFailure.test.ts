import { expect, it, vi } from 'vitest';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';
import { DynamicRateLimitStore } from '../../src/platform/http/dynamicRateLimitStore.js';
import { quotaKey } from '../../src/platform/http/quotaKeys.js';

it('fails quota admission closed with explicit 503 on SQL outage, without local counters', async () => {
  const query = vi.fn().mockRejectedValue(new Error('pool offline'));
  const store = new DynamicRateLimitStore('http.default', {
    db: { $queryRaw: query } as unknown as PrismaTransactionClient,
  });
  const key = quotaKey({ namespace: 'http.default', scope: ['org', 60], subject: 'ip:192.0.2.1', windowSeconds: 60 });
  for (let index = 0; index < 2; index += 1)
    await expect(store.increment(key)).rejects.toMatchObject({ statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
  expect(query).toHaveBeenCalledTimes(2);
  expect(store.localKeys).toBe(false);
});
