import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecentCorrectionRecordsQuery } from '@spoh/shared';
import { findRecentRegistrations } from '../../src/modules/registration/data/recentRepo.js';
import { findRecentFootfall } from '../../src/modules/footfall/data/recentRepo.js';
import { listRecentRegistrations } from '../../src/modules/registration/application/listRecentRegistrations.js';
import { listRecentFootfall } from '../../src/modules/footfall/application/listRecentFootfall.js';

const db = vi.hoisted(() => ({
  registration: { findMany: vi.fn() }, footfallTick: { findMany: vi.fn() },
}));
vi.mock('../../src/platform/db/client.js', () => ({ prisma: db }));
const scope = { eventId: 'chosen-event' };
const at = new Date('2027-01-07T03:00:00Z');
const base = { stationId: 'chosen-station', recordedAt: at, clientRecordedAt: null, source: 'APP', voided: false };
const registrations = ['c', 'b', 'a'].map((id) => ({ ...base, id, captureCategory: { code: 'SEC_1', label: 'Sec 1' }, groupId: null, missionCardId: null }));
const ticks = ['c', 'b', 'a'].map((id) => ({ ...base, id, quantity: 3, timeBlockStart: at }));

beforeEach(() => vi.resetAllMocks());

describe('recent correction selection', () => {
  it.each([
    ['registration', findRecentRegistrations, db.registration],
    ['footfall', findRecentFootfall, db.footfallTick],
  ] as const)('%s keeps event, station and mode restrictions on every page', async (_kind, read, model) => {
    model.findMany.mockResolvedValue([]);
    const query = RecentCorrectionRecordsQuery.parse({ stationId: base.stationId, rehearsal: 'true', limit: '2', cursor: 'last-row' });
    await read(scope, query);
    expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId: scope.eventId, stationId: base.stationId, rehearsal: true, voided: false },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      take: 3, cursor: { id: 'last-row' }, skip: 1,
    }));
    await read(scope, RecentCorrectionRecordsQuery.parse({ stationId: base.stationId }));
    expect(model.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ rehearsal: false }), take: 51,
    }));
    expect(model.findMany.mock.calls.at(-1)![0]).not.toHaveProperty('cursor');
  });

  it('maps registration category labels, cuts the extra row and creates the next cursor', async () => {
    db.registration.findMany.mockResolvedValue(registrations);
    const page = await listRecentRegistrations(scope, { stationId: base.stationId, limit: 2, rehearsal: false });
    expect(page.meta).toEqual({ count: 2, nextCursor: 'b' });
    expect(page.data.map((row) => row.id)).toEqual(['c', 'b']);
    expect(page.data[0]).toMatchObject({ category: 'SEC_1', categoryLabel: 'Sec 1', recordedAt: at.toISOString() });
    expect(db.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: { captureCategory: { select: { code: true, label: true } } } }));
    expect(page.data[0]).not.toHaveProperty('visitor');
  });

  it('maps footfall block/source and ends the last page honestly', async () => {
    db.footfallTick.findMany.mockResolvedValue(ticks.slice(0, 2));
    const page = await listRecentFootfall(scope, { stationId: base.stationId, limit: 2, rehearsal: false });
    expect(page.meta).toEqual({ count: 2, nextCursor: null });
    expect(page.data[0]).toMatchObject({ quantity: 3, timeBlockStart: at.toISOString(), recordedAt: at.toISOString() });
    db.footfallTick.findMany.mockResolvedValue([]);
    expect(await listRecentFootfall(scope, { stationId: base.stationId, limit: 2, rehearsal: false })).toEqual({ data: [], meta: { count: 0, nextCursor: null } });
    db.registration.findMany.mockResolvedValue([]);
    expect(await listRecentRegistrations(scope, { stationId: base.stationId, limit: 2, rehearsal: false })).toEqual({ data: [], meta: { count: 0, nextCursor: null } });
  });

  it.each([
    ['registration', listRecentRegistrations, db.registration],
    ['footfall', listRecentFootfall, db.footfallTick],
  ] as const)('does not disguise a failed %s read as an empty page', async (_kind, list, model) => {
    model.findMany.mockRejectedValue(new Error('database unavailable'));
    await expect(list(scope, { stationId: base.stationId, limit: 2, rehearsal: false })).rejects.toThrow('database unavailable');
  });
});
