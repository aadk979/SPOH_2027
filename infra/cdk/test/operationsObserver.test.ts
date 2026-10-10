import { describe, expect, it } from 'vitest';
// The Lambda's pure metadata pipeline runs without loading runtime SDK packages.
// @ts-expect-error Authored ESM Lambda assets are verified directly rather than compiled.
import { collect, observation } from '../assets/operations-observer/index.mjs';

describe('operations observer', () => {
  const now = Date.parse('2026-10-10T00:00:00Z');
  it('alarms on an absent completed backup and on a running-task deficit', () => {
    expect(
      observation({ service: { desiredCount: 2, runningCount: 1 }, recoveryPoints: [], now }),
    ).toEqual([
      { MetricName: 'RunningTaskDeficit', Unit: 'Count', Value: 1 },
      { MetricName: 'BackupAgeSeconds', Unit: 'Seconds', Value: 27 * 3600 },
    ]);
  });
  it('ignores failed/newer snapshots and treats a parked service as intentional', () => {
    const metrics = observation({
      service: { desiredCount: 0, runningCount: 0 },
      now,
      recoveryPoints: [
        { Status: 'COMPLETED', CreationDate: new Date(now - 3600_000) },
        { Status: 'FAILED', CreationDate: new Date(now) },
      ],
    });
    expect(metrics.map((metric: { Value: number }) => metric.Value)).toEqual([0, 3600]);
  });
  it('reads every backup page before publishing fixed-cardinality metrics', async () => {
    const calls: unknown[] = [];
    await collect({
      now,
      describeService: async () => ({ desiredCount: 1, runningCount: 1 }),
      listBackups: async (token?: string) =>
        token
          ? { RecoveryPoints: [{ Status: 'COMPLETED', CreationDate: new Date(now) }] }
          : { RecoveryPoints: [], NextToken: 'second' },
      publish: async (metrics: unknown) => calls.push(metrics),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ MetricName: 'BackupAgeSeconds', Value: 0 }),
      ]),
    );
  });
  it('refuses to manufacture a healthy zero when lookup fails', async () => {
    await expect(
      collect({
        now,
        describeService: async () => undefined,
        listBackups: async () => ({}),
        publish: async () => {
          throw new Error('Must not publish');
        },
      }),
    ).rejects.toThrow('Service metadata is unavailable');
  });
});
