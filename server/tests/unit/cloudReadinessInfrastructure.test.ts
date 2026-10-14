import { expect, it } from 'vitest';
import { CloudReadinessConfig } from '../../src/config/schemas/readiness.js';
import { restorableDatabase, selectedAlarms } from '../../src/platform/aws/readiness/nativeMetadata.js';
import { nativeSmoke } from '../../src/platform/aws/readiness/nativeSmoke.js';
import { cloudReadinessCache } from '../../src/platform/aws/readiness/cache.js';
import { collectCloudReadiness } from '../../src/platform/aws/readiness/ports.js';

const now = Date.parse('2026-10-14T13:17:22Z');
const config = CloudReadinessConfig.parse({ region: 'ap-southeast-1', account: '123456789012',
  nativeOrigin: 'https://owned123.execute-api.ap-southeast-1.amazonaws.com', deploymentId: 'a'.repeat(40),
  databaseIdentifier: 'owned-database', databaseId: 'arn:aws:rds:ap-southeast-1:123456789012:db:owned-database',
  requiredAlarmIds: ['arn:aws:cloudwatch:ap-southeast-1:123456789012:alarm:spoh-staging-running-tasks'],
  freshness: { smokeMaxAgeMs: 300_000, backupMaxAgeMs: 300_000, alarmsMaxAgeMs: 300_000 } });
const database = () => ({ DBInstanceIdentifier: config.databaseIdentifier, DBInstanceArn: config.databaseId,
  DBInstanceStatus: 'available', StorageEncrypted: true, PubliclyAccessible: false,
  BackupRetentionPeriod: 7, LatestRestorableTime: new Date(now - 120_000) });
const alarm = () => ({ AlarmArn: config.requiredAlarmIds[0], AlarmName: 'spoh-staging-running-tasks', StateValue: 'OK' });
const smoke = () => ({ deploymentId: config.deploymentId, observedAtMs: now, passed: true });
const snapshot = () => ({ selection: { deploymentId: config.deploymentId, databaseId: config.databaseId,
  requiredAlarmIds: config.requiredAlarmIds, freshness: config.freshness }, smoke: smoke() });

it.each([
  { nativeOrigin: 'https://attacker.example' }, { nativeOrigin: 'http://owned123.execute-api.ap-southeast-1.amazonaws.com' },
  { nativeOrigin: config.nativeOrigin + '/path' }, { nativeOrigin: config.nativeOrigin + '/' },
  { databaseId: config.databaseId.replace('123456789012', '999999999999') },
  { databaseIdentifier: 'foreign-database' }, { deploymentId: 'mutable-tag' },
  { requiredAlarmIds: [config.requiredAlarmIds[0], config.requiredAlarmIds[0]] },
  { requiredAlarmIds: [] }, { requiredAlarmIds: ['arn:aws:cloudwatch:us-east-1:123456789012:alarm:spoh-staging-running-tasks'] },
  { freshness: { ...config.freshness, backupMaxAgeMs: 300_001 } }, { hiddenFlag: true },
])('refuses foreign, mutable or relaxed cloud selection: %j', change => {
  expect(CloudReadinessConfig.safeParse({ ...config, ...change }).success).toBe(false);
});

it('selects the encrypted private database horizon without exposing unrelated metadata', () => {
  expect(restorableDatabase(config, [{ ...database(), masterUsername: 'private-value' }], now)).toEqual({
    databaseId: config.databaseId, observedAtMs: now, restorableThroughMs: now - 120_000 });
});
it.each([
  [], [database(), database()], [{ ...database(), DBInstanceIdentifier: 'foreign-database' }],
  [{ ...database(), DBInstanceArn: config.databaseId.replace('123456789012', '999999999999') }],
  [{ ...database(), DBInstanceStatus: 'stopped' }], [{ ...database(), StorageEncrypted: false }],
  [{ ...database(), PubliclyAccessible: true }], [{ ...database(), BackupRetentionPeriod: 0 }],
  [{ ...database(), LatestRestorableTime: undefined }], [{ ...database(), LatestRestorableTime: new Date(NaN) }],
].map(rows => ({ rows })))('refuses incomplete or foreign native backup metadata: %j', ({ rows }) => {
  expect(() => restorableDatabase(config, rows, now)).toThrow('Selected backup metadata');
});
it.each(['OK', 'ALARM', 'INSUFFICIENT_DATA'])('preserves observed alarm state %s rather than manufacturing OK', state => {
  expect(selectedAlarms(config, [{ ...alarm(), StateValue: state }], now)?.alarms[0]?.state).toBe(state);
});
it.each([[], [alarm(), alarm()], [{ ...alarm(), AlarmArn: 'foreign' }],
  [{ ...alarm(), AlarmName: 'foreign' }], [{ ...alarm(), StateValue: 'unknown' }]].map(rows => ({ rows })))('refuses malformed or missing alarm metadata: %j', ({ rows }) => {
  expect(() => selectedAlarms(config, rows, now)).toThrow();
});

const mockFetch = (change?: (url: string, response: Response) => Response): typeof fetch => async (url, options) => {
  expect(options?.redirect).toBe('manual'); expect(options?.signal).toBeInstanceOf(AbortSignal);
  const path = new URL(String(url)).pathname;
  const status = path === '/api/v1/events' ? 401 : ['/map', '/readyz'].includes(path) ? 404 : 200;
  const response = new Response('<html>Owned synthetic page</html>', { status,
    headers: { 'X-SPOH-Deployment': config.deploymentId } });
  return change ? change(String(url), response) : response;
};
it('checks all six native boundaries and binds every response to the selected immutable release', async () => {
  const urls: string[] = [];
  const result = await nativeSmoke(config, { now: () => now, signal: AbortSignal.timeout(1000),
    fetch: mockFetch((url, response) => { urls.push(new URL(url).pathname); return response; }) });
  expect(urls.sort()).toEqual(['/api/v1/events', '/e/smoke-check/map', '/healthz', '/map', '/readyz', '/sign-in']);
  expect(result).toEqual(smoke());
});
it('a signed-out API success is a known failed smoke', async () => {
  expect(await nativeSmoke(config, { now: () => now, signal: AbortSignal.timeout(1000),
    fetch: mockFetch((url, response) => url.endsWith('/api/v1/events') ? new Response('data', {
      headers: { 'X-SPOH-Deployment': config.deploymentId } }) : response) })).toMatchObject({ passed: false });
});
it.each(['foreign-release', null])('a mismatched or absent deployment header is unavailable, not overrideable failure: %s', identity => {
  return expect(nativeSmoke(config, { now: () => now, signal: AbortSignal.timeout(1000),
    fetch: mockFetch((_url, response) => { if (identity) response.headers.set('X-SPOH-Deployment', identity);
      else response.headers.delete('X-SPOH-Deployment'); return response; }) })).rejects.toThrow('selected deployment');
});
it('caps a document without an HTML marker before retaining an unbounded body', async () => {
  await expect(nativeSmoke(config, { now: () => now, signal: AbortSignal.timeout(1000),
    fetch: mockFetch((url, response) => url.endsWith('/sign-in') ? new Response('x'.repeat(128 * 1024 + 1), {
      headers: { 'X-SPOH-Deployment': config.deploymentId } }) : response) })).rejects.toThrow('exceeded its bound');
});

it('provider refusal preserves other independent facts and never recycles old passing evidence', async () => {
  expect(await collectCloudReadiness(config, { smoke: async () => smoke(),
    backups: async () => { throw new Error('AccessDenied'); },
    alarms: async () => selectedAlarms(config, [alarm()], now) })).toEqual({ ...snapshot(),
      alarms: selectedAlarms(config, [alarm()], now) });
});
it('coalesces callers, isolates their objects and replaces an expired pass with current unavailability', async () => {
  let instant = now; let calls = 0;
  const read = cloudReadinessCache({ now: () => instant, maxAgeMs: 30_000,
    collect: async () => { calls++; return calls === 1 ? snapshot() : { selection: snapshot().selection }; } });
  const results = await Promise.all(Array.from({ length: 20 }, () => read()));
  expect(calls).toBe(1); results[0]!.selection.requiredAlarmIds[0] = 'caller-forged';
  expect((await read()).selection.requiredAlarmIds).toEqual(config.requiredAlarmIds);
  instant += 30_000;
  expect(await read()).not.toHaveProperty('smoke'); expect(calls).toBe(2);
});

it('bounds a provider that ignores abort while preserving completed independent observations and making one attempt', async () => {
  let calls = 0;
  let observedSignal: AbortSignal | undefined;
  const result = await collectCloudReadiness(config, {
    smoke: async () => smoke(),
    backups: async signal => {
      calls++; observedSignal = signal;
      return new Promise(() => {});
    },
    alarms: async () => selectedAlarms(config, [alarm()], now),
  });
  expect(result.smoke).toEqual(smoke()); expect(result.alarms).toBeDefined();
  expect(result.backups).toBeUndefined(); expect(observedSignal?.aborted).toBe(true);
  expect(calls).toBe(1);
}, 12_000);
