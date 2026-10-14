import { expect, it, vi } from 'vitest';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';
import { readGoLiveReadiness } from '../../src/modules/event/application/readGoLiveReadiness.js';

vi.mock('../../src/modules/event/data/readinessSnapshotRepo.js', () => ({ readinessSnapshot: async () => null }));
vi.mock('../../src/modules/event/application/localReadinessEvidence.js', () => ({ localReadinessEvidence: () => ({}) }));
vi.mock('../../src/modules/content/index.js', () => ({ contentReadiness: async () => ({ requiredKeys: [], documents: [] }) }));

const instant = Date.parse('2026-10-14T13:17:22Z');
const selection = { deploymentId: 'accepted-release', databaseId: 'selected-database',
  requiredAlarmIds: ['selected-alarm'],
  freshness: { smokeMaxAgeMs: 60_000, backupMaxAgeMs: 60_000, alarmsMaxAgeMs: 60_000 } };
const freshCloud = () => ({ selection,
  smoke: { deploymentId: selection.deploymentId, observedAtMs: instant - 1, passed: true },
  backups: { databaseId: selection.databaseId, observedAtMs: instant - 1, restorableThroughMs: instant - 10_000 },
  alarms: { deploymentId: selection.deploymentId, observedAtMs: instant - 1,
    alarms: [{ id: selection.requiredAlarmIds[0], state: 'OK' }] } });
const cloudItems = async (cloud: unknown, now = instant) => {
  const input = { scope: { eventId: 'selected-event' }, now: new Date(now), cloud };
  const result = await readGoLiveReadiness({} as PrismaTransactionClient, input);
  return result.items.filter(item => ['staging-smoke', 'backups', 'alarms'].includes(item.code));
};

it('the real reader evaluates fresh server-selected cloud facts instead of discarding them', async () => {
  expect((await cloudItems(freshCloud())).map(item => [item.code, item.state])).toEqual([
    ['staging-smoke', 'passed'], ['backups', 'passed'], ['alarms', 'passed']]);
});

it('the post-lock evaluation clock refuses cloud facts that expired while awaiting locks', async () => {
  const items = await cloudItems(freshCloud(), instant + 60_001);
  expect(items.map(item => item.reasons)).toEqual(Array(3).fill(['evidence-stale']));
});

it('a known current alarm is failed while absent transport evidence remains unavailable', async () => {
  const cloud = freshCloud(); cloud.alarms.alarms[0]!.state = 'ALARM';
  expect(await cloudItems(cloud)).toContainEqual(expect.objectContaining({
    code: 'alarms', state: 'failed', reasons: ['alarms-not-ok'] }));
  expect((await cloudItems(undefined)).every(item => item.state === 'unavailable')).toBe(true);
});

it.each(['smoke', 'backups', 'alarms'] as const)('a foreign %s identity remains unavailable rather than a waiveable failure', async key => {
  const cloud = freshCloud();
  if (key === 'backups') cloud.backups.databaseId = 'foreign-database';
  else cloud[key].deploymentId = 'foreign-release';
  const code = key === 'smoke' ? 'staging-smoke' : key;
  expect(await cloudItems(cloud)).toContainEqual(expect.objectContaining({ code, state: 'unavailable' }));
});
it('missing, duplicated and insufficient alarm observations never become passing or waiveable facts', async () => {
  for (const alarms of [[], [...freshCloud().alarms.alarms, ...freshCloud().alarms.alarms],
    [{ id: 'selected-alarm', state: 'INSUFFICIENT_DATA' }]]) {
    const cloud = { ...freshCloud(), alarms: { ...freshCloud().alarms, alarms } };
    expect(await cloudItems(cloud)).toContainEqual(expect.objectContaining({ code: 'alarms', state: 'unavailable' }));
  }
});
