import { expect, it } from 'vitest';
// @ts-expect-error Standalone deployment scripts run as authored ESM.
import { powerStaging } from '../../scripts/staging-power.mjs';
const resources = {
  ClusterName: 'Spoh-staging-Platform-AppCluster123',
  ServiceName: 'Spoh-staging-Platform-AppService123',
  DatabaseIdentifier: 'spoh-staging-platform-datapostgres123',
};
const ready = {
  serviceName: resources.ServiceName,
  desiredCount: 1,
  runningCount: 1,
  pendingCount: 0,
  deployments: [{ rolloutState: 'COMPLETED' }],
};
function fixture(states: object[]) {
  let elapsed = 0,
    index = 0;
  const calls: string[][] = [];
  return {
    calls,
    now: () => elapsed,
    sleep: async (ms: number) => {
      elapsed += ms;
    },
    aws: async (args: string[]) => {
      calls.push(args);
      if (args[1] === 'describe-stacks')
        return {
          Stacks: [
            {
              Outputs: Object.entries(resources).map(([OutputKey, OutputValue]) => ({
                OutputKey,
                OutputValue,
              })),
            },
          ],
        };
      if (args[1] === 'describe-db-instances')
        return {
          DBInstances: [
            { DBInstanceIdentifier: resources.DatabaseIdentifier, DBInstanceStatus: 'available' },
          ],
        };
      if (args[1] === 'describe-services')
        return { failures: [], services: [states[Math.min(index++, states.length - 1)]] };
      return {};
    },
  };
}
it('returns to the following Smoke step only after the restored service has actually completed startup', async () => {
  const api = fixture([
    { ...ready, runningCount: 0, pendingCount: 1, deployments: [{ rolloutState: 'IN_PROGRESS' }] },
    ready,
  ]);
  await powerStaging({ operation: 'unpark', ...api });
  expect(api.calls.filter((args) => args[1] === 'describe-services')).toHaveLength(2);
  expect(api.now()).toBe(30_000);
  expect(api.calls.at(-1)![1]).toBe('describe-services');
});
it('refuses to report unpark complete when the restored task never becomes ready', async () => {
  const api = fixture([
    { ...ready, runningCount: 0, pendingCount: 1, deployments: [{ rolloutState: 'IN_PROGRESS' }] },
  ]);
  await expect(powerStaging({ operation: 'unpark', ...api })).rejects.toThrow('Timed out');
  expect(api.now()).toBe(1_800_000);
  expect(api.calls.filter((args) => args[1] === 'update-service')).toHaveLength(1);
});
it('refuses failed restored deployment metadata instead of proceeding to Smoke', async () => {
  const api = fixture([{ ...ready, deployments: [{ rolloutState: 'FAILED' }] }]);
  await expect(powerStaging({ operation: 'unpark', ...api })).rejects.toThrow('Cannot restore');
});
it('does not treat a running count alone as a completed restored deployment', async () => {
  const api = fixture([{ ...ready, deployments: [{ rolloutState: 'IN_PROGRESS' }] }, ready]);
  await powerStaging({ operation: 'unpark', ...api });
  expect(api.calls.filter((args) => args[1] === 'describe-services')).toHaveLength(2);
  expect(api.now()).toBe(30_000);
});
it('refuses foreign, incomplete or externally changed restoration metadata', async () => {
  for (const state of [
    { ...ready, serviceName: 'foreign-service' },
    { ...ready, desiredCount: 0 },
    { ...ready, deployments: [] },
    { ...ready, pendingCount: undefined },
  ]) {
    const api = fixture([state]);
    await expect(powerStaging({ operation: 'unpark', ...api })).rejects.toThrow('Cannot restore');
    expect(api.calls.filter((args) => args[1] === 'update-service')).toHaveLength(1);
  }
});
