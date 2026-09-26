import { afterEach, describe, expect, it, vi } from 'vitest';
import { blockLabel } from '@/lib/format';

/**
 * F01-046: shift labels must follow the configured shift hours, which an admin
 * changes for a dry run, not the hours the client was compiled with.
 */

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: vi.fn() };
});

const apiModule = await import('@/lib/api');
const mockedApi = vi.mocked(apiModule.api);

const MOVED = {
  MORNING: { start: '08:00', end: '12:30' },
  AFTERNOON: { start: '12:00', end: '16:00' },
};

afterEach(() => {
  mockedApi.mockReset();
});

describe('shift labels (F01-046)', () => {
  it('labels a block with the hours it is given', () => {
    expect(blockLabel('MORNING', MOVED)).toBe('08:00–12:30');
    expect(blockLabel('AFTERNOON', MOVED)).toBe('12:00–16:00');
  });

  it('loads the configured shift hours with the other runtime settings', async () => {
    const { getClientSettings, loadClientSettings } = await import('@/lib/runtimeSettings');
    mockedApi.mockResolvedValueOnce({
      settings: {
        dashboardPollSeconds: 3,
        alertPollSeconds: 10,
        captureUndoWindowSeconds: 10,
        captureSendGraceSeconds: 2,
        outboxWarningCount: 20,
        outboxWarningAgeMinutes: 5,
        silentStationMinutes: 15,
        staleDeviceMinutes: 15,
        eventName: 'SPOH 2027',
        shiftBlocks: MOVED,
      },
    });

    await loadClientSettings();

    expect(getClientSettings().shiftBlocks).toEqual(MOVED);
  });
});
