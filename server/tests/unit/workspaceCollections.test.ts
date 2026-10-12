import { describe, expect, it, vi } from 'vitest';
import type { ReadContext } from '../../src/platform/access/currentRead.js';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';
import { mapReadRows, readableCollectionStations } from '../../src/platform/workspace/sourceRead.js';
import { ServiceUnavailableError } from '../../src/platform/errors/index.js';

function context(input: { candidates: string[]; granted?: boolean; allowed?: string[] }): ReadContext {
  const db = { station: {
    findMany: vi.fn(async () => input.candidates.map((id) => ({ id }))),
    findFirst: vi.fn(async () => input.candidates[0] ? { id: input.candidates[0] } : null),
  }, eventMembership: { findFirst: vi.fn(async () => ({ role: 'CHIEF_COORDINATOR' })) },
  rolePermission: { findMany: vi.fn(async () => input.granted ? [{ role: 'CHIEF_COORDINATOR', action: 'Dashboard.ReadStation' }] : []) } };
  return { scope: { eventId: 'event' }, personId: 'person', membershipId: 'member', now: new Date(),
    db: db as unknown as PrismaTransactionClient,
    canRead: vi.fn(async ({ action, resource }) => action === 'Self.Read' || !!input.allowed?.includes(resource.id)) };
}

describe('current station collection authority', () => {
  it('does not replace an actual Cedar denial with a stored role grant', async () => {
    const reader = context({ candidates: ['denied-station'], granted: true });
    await expect(readableCollectionStations(reader, 'Dashboard.ReadStation')).rejects.toMatchObject({ statusCode: 403 });
    expect(reader.db.rolePermission.findMany).not.toHaveBeenCalled();
  });
  it('returns only actually permitted candidate IDs', async () => {
    await expect(readableCollectionStations(context({ candidates: ['denied', 'allowed'], allowed: ['allowed'] }),
      'Dashboard.ReadStation')).resolves.toEqual(['allowed']);
  });
  it('uses current identity and the stored grant only for a genuinely empty event', async () => {
    await expect(readableCollectionStations(context({ candidates: [], granted: true }), 'Dashboard.ReadStation')).resolves.toEqual([]);
    await expect(readableCollectionStations(context({ candidates: [] }), 'Dashboard.ReadStation')).rejects.toMatchObject({ statusCode: 403 });
    const inactive = context({ candidates: [], granted: true });
    inactive.canRead = vi.fn(async () => false);
    await expect(readableCollectionStations(inactive, 'Dashboard.ReadStation')).rejects.toMatchObject({ statusCode: 403 });
    expect(inactive.db.rolePermission.findMany).not.toHaveBeenCalled();
  });
  it('propagates evaluation outages without falling back to a grant', async () => {
    const reader = context({ candidates: ['station'], granted: true });
    reader.canRead = vi.fn(async () => { throw new ServiceUnavailableError('Permissions could not be checked.'); });
    await expect(readableCollectionStations(reader, 'Dashboard.ReadStation')).rejects.toMatchObject({ statusCode: 503 });
    expect(reader.db.rolePermission.findMany).not.toHaveBeenCalled();
  });
});

describe('transaction row projection', () => {
  it('finishes each row before starting the next private facet and preserves order', async () => {
    const calls: string[] = [];
    let finishFirst!: () => void;
    const first = new Promise<void>((resolve) => { finishFirst = resolve; });
    const projection = mapReadRows(['first', 'second'], async (row) => {
      calls.push('start:' + row);
      if (row === 'first') await first;
      calls.push('finish:' + row);
      return row.toUpperCase();
    });
    expect(calls).toEqual(['start:first']);
    finishFirst();
    await expect(projection).resolves.toEqual(['FIRST', 'SECOND']);
    expect(calls).toEqual(['start:first', 'finish:first', 'start:second', 'finish:second']);
  });
  it('does not start later private reads after the transaction has failed', async () => {
    const read = vi.fn(async () => { throw new ServiceUnavailableError('Synthetic read failure'); });
    await expect(mapReadRows(['first', 'second'], read)).rejects.toMatchObject({ statusCode: 503 });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith('first');
  });
});
