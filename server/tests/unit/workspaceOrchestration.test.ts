import { expect, it, vi } from 'vitest';
import type { ReadContext } from '../../src/platform/access/currentRead.js';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';
import type { WorkspaceSource } from '../../src/platform/workspace/sourceRead.js';
import { ForbiddenError, ServiceUnavailableError } from '../../src/platform/errors/index.js';
import { readEntity, readRecords, searchWorkspace, type WorkspaceSources } from '../../src/modules/workspace/application/readWorkspace.js';
const now = new Date('2026-10-11T08:00:00Z');
function context(): ReadContext { return { scope: { eventId: 'event' }, personId: 'person', membershipId: 'member', now,
  db: {} as PrismaTransactionClient, canRead: vi.fn(async () => true) }; }
const source = (search?: WorkspaceSource['search']): WorkspaceSource => ({ entity: vi.fn(async () => null), ...(search ? { search } : {}) });
const registry = (entities: Record<string, WorkspaceSource>): WorkspaceSources => ({ entities, records: entities } as WorkspaceSources);
it('dispatches exact typed entity/record requests and turns absent entities into 404', async () => {
  const reader = source();
  const sources = registry({ station: reader });
  await expect(readEntity(context(), { ref: { kind: 'station', id: 'missing' }, sources })).rejects.toMatchObject({ statusCode: 404 });
  expect(reader.entity).toHaveBeenCalledWith(expect.anything(), { kind: 'station', id: 'missing' });
  const request = { filter: { kind: 'footfall' as const, rehearsal: false }, limit: 1 };
  reader.records = vi.fn(async () => ({ filter: request.filter, asOf: now.toISOString(), data: [], aggregate: { value: 0, unit: 'roomEntries' as const }, meta: { count: 0, nextCursor: null } }));
  await readRecords(context(), { sources: registry({ footfall: reader }), request });
  expect(reader.records).toHaveBeenCalledWith(expect.anything(), request);
});
it('runs each shared source once, omits clean denials and de-duplicates bounded search destinations', async () => {
  const item = { title: 'Card ABC123', detail: 'Issued', destination: { kind: 'card' as const, id: 'card' } };
  const read = vi.fn(async () => [item, item, { title: 'Station', detail: 'Desk', destination: { kind: 'station' as const, id: 'station' } }]);
  const shared = source(read);
  const sources = registry({ card: shared, station: shared, person: source(async () => { throw new ForbiddenError(); }), gift: source() });
  const result = await searchWorkspace(context(), { sources, query: { query: 'Card', limit: 1 } });
  expect(read).toHaveBeenCalledTimes(1);
  expect(result).toEqual({ data: [item], meta: { count: 1, truncated: true } });
});
it('propagates policy/source failures and refuses unbound callers before searching', async () => {
  const sources = registry({ station: source(async () => { throw new ServiceUnavailableError('Permissions unavailable'); }) });
  await expect(searchWorkspace(context(), { sources, query: { query: 'Station', limit: 20 } })).rejects.toMatchObject({ statusCode: 503 });
  const denied = context();
  denied.canRead = vi.fn(async () => false);
  await expect(searchWorkspace(denied, { sources, query: { query: 'Station', limit: 20 } })).rejects.toMatchObject({ statusCode: 403 });
});
