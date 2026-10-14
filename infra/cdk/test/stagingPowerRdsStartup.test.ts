import { expect, it } from 'vitest';
// @ts-expect-error Standalone deployment scripts run as authored ESM.
import { powerStaging } from '../../scripts/staging-power.mjs';
const resources = {
  ClusterName: 'Spoh-staging-Platform-AppCluster123',
  ServiceName: 'Spoh-staging-Platform-AppService123',
  DatabaseIdentifier: 'spoh-staging-platform-datapostgres123',
};
function fixture(statuses: string[]) {
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
            {
              DBInstanceIdentifier: resources.DatabaseIdentifier,
              DBInstanceStatus: statuses[Math.min(index++, statuses.length - 1)],
            },
          ],
        };
      if (args[1] === 'describe-services')
        return {
          failures: [],
          services: [
            {
              serviceName: resources.ServiceName,
              desiredCount: 1,
              runningCount: 1,
              pendingCount: 0,
              deployments: [{ rolloutState: 'COMPLETED' }],
            },
          ],
        };
      return {};
    },
  };
}
it('observes the actual configuring-enhanced-monitoring startup state without repeating an accepted RDS start', async () => {
  const api = fixture(['stopped', 'starting', 'configuring-enhanced-monitoring', 'available']);
  await powerStaging({ operation: 'unpark', ...api });
  expect(api.calls.filter((args) => args[1] === 'start-db-instance')).toHaveLength(1);
  expect(api.calls.filter((args) => args[1] === 'update-service')).toHaveLength(1);
  expect(api.now()).toBe(60_000);
});
it('can resume observation of an already configuring database without submitting any new database start', async () => {
  const api = fixture(['configuring-enhanced-monitoring', 'available']);
  await powerStaging({ operation: 'unpark', ...api });
  expect(api.calls.filter((args) => args[1] === 'start-db-instance')).toHaveLength(0);
  expect(api.calls.filter((args) => args[1] === 'update-service')).toHaveLength(1);
});
