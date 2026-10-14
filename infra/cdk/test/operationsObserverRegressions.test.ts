import assert from 'node:assert/strict';
import { it as test } from 'vitest';
// @ts-expect-error Authored Lambda assets are verified directly.
import { collect, observation } from '../assets/operations-observer/index.mjs';

const now = Date.parse('2026-10-14T13:17:22Z');
test('an observed backup AccessDenied retains honest task observations and alarmable backup uncertainty', async () => {
  const published: Array<Array<{ MetricName: string; Unit: string; Value: number }>> = [];
  const failure = new Error('Insufficient privileges to perform this action.'); failure.name = 'AccessDeniedException';
  await assert.rejects(collect({ now,
    describeService: async () => ({ desiredCount: 1, runningCount: 1 }),
    listBackups: async () => { throw failure; },
    publish: async (metrics: Array<{ MetricName: string; Unit: string; Value: number }>) => published.push(metrics),
  }), /Insufficient privileges/);
  assert.equal(published.length, 1, 'A backup lookup failure must not suppress the independent running-task observation');
  assert.deepEqual(published[0], [
    { MetricName: 'RunningTaskDeficit', Unit: 'Count', Value: 0 },
    { MetricName: 'BackupAgeSeconds', Unit: 'Seconds', Value: 27 * 3600 },
  ]);
});
test('future completed backup timestamps cannot be reported as a healthy age zero', () => {
  assert.throws(() => observation({ service: { desiredCount: 1, runningCount: 1 }, now,
    recoveryPoints: [{ Status: 'COMPLETED', CreationDate: new Date(now + 60000) }],
  }), /backup|future|metadata/i);
});
test('malformed completed backup timestamps refuse before publishing a non-finite value', () => {
  assert.throws(() => observation({ service: { desiredCount: 1, runningCount: 1 }, now,
    recoveryPoints: [{ Status: 'COMPLETED', CreationDate: 'unparseable-provider-date' }],
  }), /backup|timestamp|metadata/i);
});




// @ts-expect-error Authored Lambda metadata adapter is verified directly.
import { databaseSelection, nativeBackupPage } from '../assets/operations-observer/nativeBackup.mjs';


const identifier = 'owned-database';
const selection = databaseSelection(`arn:aws:rds:ap-southeast-1:123456789012:db:${identifier}`, identifier);
const snapshot = () => ({ DBInstanceIdentifier: identifier, SnapshotType: 'automated',
  Encrypted: true, Status: 'available', SnapshotCreateTime: new Date(now - 3600000),
  DBSnapshotArn: `arn:aws:rds:ap-southeast-1:123456789012:snapshot:rds:${identifier}-2026-10-14-00-00` });

test('keeps native automated snapshot age distinct from PITR horizon', () => {
  assert.deepEqual(nativeBackupPage({ DBSnapshots: [snapshot()], Marker: 'next-page' }, selection), {
    RecoveryPoints: [{ Status: 'COMPLETED', CreationDate: new Date(now - 3600000) }], NextToken: 'next-page' });
});
for (const change of [
  { DBInstanceIdentifier: 'foreign' }, { SnapshotType: 'manual' }, { Encrypted: false },
  { DBSnapshotArn: snapshot().DBSnapshotArn.replace('123456789012', '999999999999') },
  { DBSnapshotArn: snapshot().DBSnapshotArn.replace('ap-southeast-1', 'us-east-1') }, { Status: '' },
]) test(`refuses foreign or incomplete native snapshot ${JSON.stringify(change)}`, () => {
  assert.throws(() => nativeBackupPage({ DBSnapshots: [{ ...snapshot(), ...change }] }, selection));
});
test('refuses a database ARN whose identifier was changed independently', () => {
  assert.throws(() => databaseSelection('arn:aws:rds:ap-southeast-1:123456789012:db:foreign', identifier));
});
test('ECS denial preserves real backup age, publishes no fabricated task zero and still fails', async () => {
  const failure = new Error('Owned service lookup denied'); const published: Array<Array<{ MetricName: string; Unit: string; Value: number }>> = [];
  await assert.rejects(collect({ now, describeService: async () => { throw failure; },
    listBackups: async () => nativeBackupPage({ DBSnapshots: [snapshot()] }, selection),
    publish: async (metrics: Array<{ MetricName: string; Unit: string; Value: number }>) => published.push(metrics) }), error => error === failure);
  assert.deepEqual(published, [[{ MetricName: 'BackupAgeSeconds', Unit: 'Seconds', Value: 3600 }]]);
});
test('both unavailable readers refuse without manufacturing any task/backup zero', async () => {
  const published: Array<Array<{ MetricName: string; Unit: string; Value: number }>> = [];
  await assert.rejects(collect({ now, describeService: async () => undefined,
    listBackups: async () => ({}), publish: async (metrics: Array<{ MetricName: string; Unit: string; Value: number }>) => published.push(metrics) }), /Service metadata/);
  assert.equal(published.length, 0);
});
test('repeated pagination fails after two pages and preserves alarmable backup uncertainty', async () => {
  let calls = 0; const published: Array<Array<{ MetricName: string; Unit: string; Value: number }>> = [];
  await assert.rejects(collect({ now, describeService: async () => ({ desiredCount: 0, runningCount: 0 }),
    listBackups: async () => { calls++; return { RecoveryPoints: [], NextToken: 'repeated' }; },
    publish: async (metrics: Array<{ MetricName: string; Unit: string; Value: number }>) => published.push(metrics) }), /pagination/);
  assert.equal(calls, 2);
  assert.deepEqual(published, [[
    { MetricName: 'RunningTaskDeficit', Unit: 'Count', Value: 0 },
    { MetricName: 'BackupAgeSeconds', Unit: 'Seconds', Value: 27 * 3600 },
  ]]);
});
test('unbounded distinct provider pages refuse after the twenty-page bound', async () => {
  let calls = 0;
  await assert.rejects(collect({ now, describeService: async () => ({ desiredCount: 1, runningCount: 1 }),
    listBackups: async () => { calls++; return { RecoveryPoints: [], NextToken: `page-${calls}` }; },
    publish: async () => {} }), /pagination/);
  assert.equal(calls, 20);
});
