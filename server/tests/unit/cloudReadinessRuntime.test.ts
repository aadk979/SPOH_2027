import { beforeEach, expect, it, vi } from 'vitest';
import { CloudReadinessConfig } from '../../src/config/schemas/readiness.js';

const runtime = vi.hoisted(() => ({ config: undefined as CloudReadinessConfig | undefined,
  instant: Date.parse('2026-10-14T13:17:22Z'), factory: vi.fn(), smoke: vi.fn(), backups: vi.fn(), alarms: vi.fn() }));
vi.mock('../../src/config/env.js', () => ({ env: { get READINESS_CLOUD_CONFIG() { return runtime.config; } } }));
vi.mock('../../src/platform/time/index.js', () => ({ systemClock: { now: () => new Date(runtime.instant) } }));
vi.mock('../../src/platform/aws/readiness/readers.js', () => ({ cloudReadinessReaders: runtime.factory }));

const selection = () => CloudReadinessConfig.parse({ region: 'ap-southeast-1', account: '123456789012',
  nativeOrigin: 'https://owned123.execute-api.ap-southeast-1.amazonaws.com', deploymentId: 'a'.repeat(40),
  databaseIdentifier: 'owned-database', databaseId: 'arn:aws:rds:ap-southeast-1:123456789012:db:owned-database',
  requiredAlarmIds: ['arn:aws:cloudwatch:ap-southeast-1:123456789012:alarm:spoh-staging-running-tasks'],
  freshness: { smokeMaxAgeMs: 1000, backupMaxAgeMs: 5000, alarmsMaxAgeMs: 5000 } });

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); runtime.config = undefined;
  runtime.instant = Date.parse('2026-10-14T13:17:22Z');
  runtime.factory.mockReturnValue({ smoke: runtime.smoke, backups: runtime.backups, alarms: runtime.alarms });
  runtime.smoke.mockImplementation(async () => ({ deploymentId: runtime.config!.deploymentId,
    observedAtMs: runtime.instant, passed: true }));
  runtime.backups.mockImplementation(async () => ({ databaseId: runtime.config!.databaseId,
    observedAtMs: runtime.instant, restorableThroughMs: runtime.instant - 1 }));
  runtime.alarms.mockImplementation(async () => ({ deploymentId: runtime.config!.deploymentId,
    observedAtMs: runtime.instant, alarms: [{ id: runtime.config!.requiredAlarmIds[0]!, state: 'OK' }] }));
});

it('does not start SDK readers or claim cloud facts when the local process has no infrastructure selection', async () => {
  const { readCloudReadiness } = await import('../../src/platform/aws/readiness/index.js');
  expect(await readCloudReadiness()).toBeUndefined(); expect(runtime.factory).not.toHaveBeenCalled();
});

it('wires the configured process to its selected readers, current clock and independent caller snapshots', async () => {
  runtime.config = selection();
  const { readCloudReadiness } = await import('../../src/platform/aws/readiness/index.js');
  const result = await readCloudReadiness();
  expect(result).toEqual({ selection: { deploymentId: runtime.config.deploymentId,
    databaseId: runtime.config.databaseId, requiredAlarmIds: runtime.config.requiredAlarmIds,
    freshness: runtime.config.freshness },
    smoke: { deploymentId: runtime.config.deploymentId, observedAtMs: runtime.instant, passed: true },
    backups: { databaseId: runtime.config.databaseId, observedAtMs: runtime.instant,
      restorableThroughMs: runtime.instant - 1 },
    alarms: { deploymentId: runtime.config.deploymentId, observedAtMs: runtime.instant,
      alarms: [{ id: runtime.config.requiredAlarmIds[0], state: 'OK' }] } });
  expect(runtime.factory).toHaveBeenCalledTimes(1);
  expect(runtime.factory).toHaveBeenCalledWith(runtime.config, expect.objectContaining({ fetch }));
  const inputs = runtime.factory.mock.calls[0]![1] as { now: () => number };
  expect(inputs.now()).toBe(runtime.instant);
  result!.selection.requiredAlarmIds[0] = 'caller-forged';
  expect((await readCloudReadiness())!.selection.requiredAlarmIds).toEqual(runtime.config.requiredAlarmIds);
});

it('uses half the shortest configured freshness bound and replaces a previous pass after a provider refusal', async () => {
  runtime.config = selection();
  const { readCloudReadiness } = await import('../../src/platform/aws/readiness/index.js');
  expect((await readCloudReadiness())!.backups).toBeDefined();
  runtime.instant += 499;
  expect((await readCloudReadiness())!.backups).toBeDefined();
  expect(runtime.backups).toHaveBeenCalledTimes(1);
  runtime.instant += 1;
  runtime.backups.mockRejectedValueOnce(new Error('Selected database read denied'));
  const refreshed = await readCloudReadiness();
  expect(refreshed!.backups).toBeUndefined();
  expect(refreshed!.smoke?.observedAtMs).toBe(runtime.instant);
  expect(refreshed!.alarms?.observedAtMs).toBe(runtime.instant);
  expect(runtime.backups).toHaveBeenCalledTimes(2);
});

it('refetches when the process clock moves backward rather than treating future cached evidence as current', async () => {
  runtime.config = selection();
  const { readCloudReadiness } = await import('../../src/platform/aws/readiness/index.js');
  await readCloudReadiness(); runtime.instant -= 1;
  expect((await readCloudReadiness())!.smoke?.observedAtMs).toBe(runtime.instant);
  expect(runtime.smoke).toHaveBeenCalledTimes(2);
});
