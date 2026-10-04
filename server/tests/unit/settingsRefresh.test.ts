import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ findMany: vi.fn(), upsert: vi.fn(), writeAudit: vi.fn() }));
vi.mock('../../src/platform/db/client.js', () => ({
  prisma: {
    appSetting: { findMany: db.findMany },
    $transaction: async (run: (tx: object) => Promise<unknown>) =>
      run({ appSetting: { upsert: db.upsert } }),
  },
}));
vi.mock('../../src/platform/audit/index.js', () => ({ writeAudit: db.writeAudit }));
vi.mock('../../src/platform/events/cacheBus.js', () => ({
  subscribeCacheEvent: vi.fn(),
  onCacheBusRecovered: vi.fn(),
}));
import {
  getSettings,
  loadSettings,
  settingsMeta,
  updateSettings,
} from '../../src/platform/settings/index.js';

function rows(value: number) {
  return [
    {
      key: 'staleDeviceMinutes',
      value,
      updatedAt: new Date('2026-10-04T10:00:00Z'),
      updatedById: 'synthetic-actor',
    },
  ];
}
beforeEach(async () => {
  db.findMany.mockReset();
  db.upsert.mockReset();
  db.writeAudit.mockReset();
  db.findMany.mockResolvedValue(rows(15));
  await loadSettings();
  db.findMany.mockClear();
});

describe('runtime settings refresh ownership', () => {
  it('reads after an older in-flight refresh and never publishes its stale result last', async () => {
    let finish!: (value: ReturnType<typeof rows>) => void;
    db.findMany
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce(rows(16));
    const older = loadSettings();
    await vi.waitFor(() => expect(db.findMany).toHaveBeenCalledTimes(1));
    const newer = loadSettings();
    await Promise.resolve();
    expect(db.findMany).toHaveBeenCalledTimes(1);
    finish(rows(15));
    expect((await older).staleDeviceMinutes).toBe(15);
    expect((await newer).staleDeviceMinutes).toBe(16);
    expect(getSettings().staleDeviceMinutes).toBe(16);
  });

  it('returns the committed write when another refresh is requested before its read finishes', async () => {
    let finish!: (value: ReturnType<typeof rows>) => void;
    let finishNotification!: (value: ReturnType<typeof rows>) => void;
    db.findMany
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishNotification = resolve;
          }),
      );
    const written = updateSettings({ staleDeviceMinutes: 16 }, 'synthetic-actor', {
      actorId: 'synthetic-actor',
      actorSub: 'synthetic-subject',
      membershipId: null,
      requestId: 'synthetic-request',
      ip: '127.0.0.1',
      userAgent: null,
      eventId: null,
    });
    await vi.waitFor(() => expect(db.findMany).toHaveBeenCalledTimes(1));
    const notification = loadSettings();
    finish(rows(16));
    const result = await written;
    expect(result.staleDeviceMinutes).toBe(16);
    expect(settingsMeta().overriddenKeys).toEqual(['staleDeviceMinutes']);
    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect(db.writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'settings.update', after: { staleDeviceMinutes: 16 } }),
    );
    await vi.waitFor(() => expect(db.findMany).toHaveBeenCalledTimes(2));
    finishNotification(rows(16));
    await notification;
  });

  it('keeps the previous valid cache after a failed read and still runs the next refresh', async () => {
    db.findMany
      .mockRejectedValueOnce(new Error('synthetic database failure'))
      .mockResolvedValueOnce(rows(17));
    expect((await loadSettings()).staleDeviceMinutes).toBe(15);
    expect((await loadSettings()).staleDeviceMinutes).toBe(17);
    expect(getSettings().staleDeviceMinutes).toBe(17);
  });
});
