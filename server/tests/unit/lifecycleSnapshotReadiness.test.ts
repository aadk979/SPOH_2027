import { beforeEach, expect, it, vi } from 'vitest';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';
import type { LifecycleEvent } from '../../src/modules/event/data/lifecycleRepo.js';
import { lifecycleSnapshot } from '../../src/modules/event/application/lifecycleSnapshot.js';
import { GoLiveCheckCode } from '@spoh/shared';

const mocks = vi.hoisted(() => ({ read: vi.fn(), count: vi.fn(), archive: vi.fn() }));
vi.mock('../../src/modules/event/application/readGoLiveReadiness.js', () => ({
  readGoLiveReadiness: mocks.read,
}));
vi.mock('../../src/modules/event/data/lifecycleRepo.js', () => ({
  registrationStationTypeCount: mocks.count,
}));
vi.mock('../../src/modules/event/application/archiveReadiness.js', () => ({
  archiveReadiness: mocks.archive,
}));
const tx = {} as PrismaTransactionClient;
const scope = { eventId: 'event' };
const now = new Date('2026-10-06T00:00:00Z');
const event: LifecycleEvent = {
  id: scope.eventId,
  organisationId: 'organisation',
  timezone: 'Asia/Singapore',
  status: 'READY',
  lifecycleVersion: 1,
  hasBeenLive: false,
  closedAt: null,
  archivedAt: null,
  _count: { days: 1, shiftTemplates: 1, stationTypes: 1, captureCategories: 1 },
};
const archive = {
  lostPersonPurgeComplete: false,
  finalReportExists: false,
  captureGracePeriodComplete: false,
  lostFoundClosed: false,
  fallbackWindowsClosed: false,
  exportPackExists: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({
    items: GoLiveCheckCode.options.map((code) => ({
      code,
      state: 'unavailable',
      passed: false,
      reasons: ['evidence-unavailable'],
    })),
    checks: [],
  });
  mocks.count.mockResolvedValue(1);
  mocks.archive.mockResolvedValue(archive);
});

it('reads readiness exactly once with the caller transaction, event scope and post-wait instant', async () => {
  const result = await lifecycleSnapshot(tx, scope, { event, now });
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(mocks.read).toHaveBeenCalledWith(tx, { scope, now });
  expect(mocks.archive).toHaveBeenCalledWith(tx, scope, { event, now });
  expect(result).toMatchObject({
    from: 'READY',
    hasBeenLive: false,
    closedAt: null,
    archive,
    goLiveChecks: [],
    structure: {
      timezoneValid: true,
      eventDays: 1,
      shiftTemplates: 1,
      stationTypes: 1,
      registrationStationTypes: 1,
      categories: 1,
    },
  });
  expect(result.goLiveReadiness).toHaveLength(11);
});

it('does not mask an observation failure as passed or unavailable evidence', async () => {
  const error = new Error('Snapshot read failed');
  mocks.read.mockRejectedValueOnce(error);
  await expect(lifecycleSnapshot(tx, scope, { event, now })).rejects.toBe(error);
  expect(mocks.count).not.toHaveBeenCalled();
  expect(mocks.archive).not.toHaveBeenCalled();
});
