import { beforeEach, expect, it, vi } from 'vitest';
import { CloudReadinessConfig } from '../../src/config/schemas/readiness.js';
import { cloudReadinessReaders } from '../../src/platform/aws/readiness/readers.js';

const sdk = vi.hoisted(() => ({ rds: vi.fn(), cloudwatch: vi.fn(), configurations: vi.fn() }));
vi.mock('@aws-sdk/client-rds', () => ({
  RDSClient: class { constructor(configuration: unknown) { sdk.configurations('rds', configuration); }
    send = sdk.rds; },
  DescribeDBInstancesCommand: class { constructor(readonly input: unknown) {} },
}));
vi.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient: class { constructor(configuration: unknown) { sdk.configurations('cloudwatch', configuration); }
    send = sdk.cloudwatch; },
  DescribeAlarmsCommand: class { constructor(readonly input: unknown) {} },
}));
const now = Date.parse('2026-10-14T13:17:22Z');
const config = CloudReadinessConfig.parse({ region: 'ap-southeast-1', account: '123456789012',
  nativeOrigin: 'https://owned123.execute-api.ap-southeast-1.amazonaws.com', deploymentId: 'a'.repeat(40),
  databaseIdentifier: 'owned-database', databaseId: 'arn:aws:rds:ap-southeast-1:123456789012:db:owned-database',
  requiredAlarmIds: ['arn:aws:cloudwatch:ap-southeast-1:123456789012:alarm:spoh-staging-running-tasks'],
  freshness: { smokeMaxAgeMs: 300_000, backupMaxAgeMs: 300_000, alarmsMaxAgeMs: 300_000 } });
beforeEach(() => {
  vi.clearAllMocks();
  sdk.rds.mockResolvedValue({ DBInstances: [{ DBInstanceIdentifier: config.databaseIdentifier,
    DBInstanceArn: config.databaseId, DBInstanceStatus: 'available', StorageEncrypted: true,
    PubliclyAccessible: false, BackupRetentionPeriod: 7, LatestRestorableTime: new Date(now - 120_000) }] });
  sdk.cloudwatch.mockResolvedValue({ MetricAlarms: [{ AlarmArn: config.requiredAlarmIds[0],
    AlarmName: 'spoh-staging-running-tasks', StateValue: 'OK' }] });
});
it('uses only own database/explicit metric alarm names, one SDK attempt and the caller deadline', async () => {
  const readers = cloudReadinessReaders(config, { now: () => now, fetch: vi.fn() });
  const signal = AbortSignal.timeout(1000);
  expect(await readers.backups(signal)).toMatchObject({ databaseId: config.databaseId, restorableThroughMs: now - 120_000 });
  expect(await readers.alarms(signal)).toMatchObject({ deploymentId: config.deploymentId });
  expect(sdk.configurations.mock.calls).toEqual([
    ['rds', { region: config.region, maxAttempts: 1 }], ['cloudwatch', { region: config.region, maxAttempts: 1 }],
  ]);
  expect(sdk.rds).toHaveBeenCalledWith(expect.objectContaining({ input: { DBInstanceIdentifier: config.databaseIdentifier } }), { abortSignal: signal });
  expect(sdk.cloudwatch).toHaveBeenCalledWith(expect.objectContaining({ input: {
    AlarmNames: ['spoh-staging-running-tasks'], AlarmTypes: ['MetricAlarm'], MaxRecords: 100,
  } }), { abortSignal: signal });
});
it.each(['database', 'alarms', 'composite'])('refuses a partial %s response instead of accepting the first result', async kind => {
  const readers = cloudReadinessReaders(config, { now: () => now, fetch: vi.fn() });
  if (kind === 'database') sdk.rds.mockResolvedValue({ Marker: 'unexpected', DBInstances: [] });
  else sdk.cloudwatch.mockResolvedValue(kind === 'alarms' ? { NextToken: 'unexpected', MetricAlarms: [] }
    : { CompositeAlarms: [{ AlarmArn: 'unexpected' }], MetricAlarms: [] });
  await expect((kind === 'database' ? readers.backups : readers.alarms)(AbortSignal.timeout(1000))).rejects.toThrow('incomplete');
});
