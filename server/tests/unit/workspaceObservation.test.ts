import { expect, it, vi } from 'vitest';
import type { ReadContext } from '../../src/platform/access/currentRead.js';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';
import { boundedPage, capturePool, observedTime } from '../../src/platform/workspace/observation.js';
import { afterTime } from '../../src/platform/db/workspacePagination.js';
const now = new Date('2026-10-11T16:10:00Z');
function context(): ReadContext {
  return { scope: { eventId: 'event' }, personId: 'person', now, canRead: vi.fn(),
    db: { event: { findUniqueOrThrow: vi.fn(async () => ({ timezone: 'Asia/Singapore', dayBoundaryMinutes: 0 })) } } as unknown as PrismaTransactionClient };
}
it('keeps a last-hour window across midnight unless a date explicitly intersects it', async () => {
  const from = '2026-10-11T15:10:00Z';
  expect(await observedTime(context(), { from, asOf: now.toISOString() })).toEqual({ gte: new Date(from), lte: now });
  expect(await observedTime(context(), { from, date: '2026-10-12', asOf: now.toISOString() }))
    .toEqual({ gte: new Date('2026-10-11T16:00:00Z'), lt: new Date('2026-10-12T16:00:00Z'), lte: now });
});
it('preserves narrower explicit bounds and refuses a future observation', async () => {
  const filter = { date: '2026-10-12', from: '2026-10-11T16:05:00Z', to: '2026-10-11T16:09:00Z' };
  expect(await observedTime(context(), filter)).toEqual({ gte: new Date(filter.from), lt: new Date(filter.to), lte: now });
  await expect(observedTime(context(), { asOf: '2026-10-11T16:11:00Z' })).rejects.toMatchObject({ statusCode: 400 });
});
it('keeps exact false pool selection distinct from inclusive practice history', () => {
  expect(capturePool({})).toEqual({ rehearsal: false });
  expect(capturePool({ rehearsal: false })).toEqual({ rehearsal: false });
  expect(capturePool({ rehearsal: true })).toEqual({ rehearsal: true });
  expect(capturePool({ includeRehearsal: true })).toEqual({});
});
it('uses a deterministic timestamp and identifier boundary and keeps full-page cursor honest', () => {
  expect(afterTime(null, 'recordedAt')).toEqual({});
  expect(afterTime({ at: now, id: 'second' }, 'recordedAt')).toEqual({ OR: [
    { recordedAt: { lt: now } }, { recordedAt: now, id: { lt: 'second' } } ] });
  expect(boundedPage([{ id: 'first' }, { id: 'second' }], 1)).toEqual({ rows: [{ id: 'first' }], nextCursor: 'first' });
  expect(boundedPage([{ id: 'first' }], 1)).toEqual({ rows: [{ id: 'first' }], nextCursor: null });
});
