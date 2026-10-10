import { describe, expect, it } from 'vitest';
// @ts-expect-error Standalone deployment scripts run as authored ESM.
import { powerStaging } from '../../scripts/staging-power.mjs';

const outputs = {
  ClusterName: 'Spoh-staging-Platform-AppCluster123',
  ServiceName: 'Spoh-staging-Platform-AppService123',
  DatabaseIdentifier: 'spoh-staging-platform-datapostgres123',
};
const stack = (resources: Record<string, string>) => ({
  Stacks: [
    {
      Outputs: Object.entries(resources).map(([OutputKey, OutputValue]) => ({
        OutputKey,
        OutputValue,
      })),
    },
  ],
});
const stub = (status: string, resources = outputs) => {
  const calls: string[][] = [];
  return {
    calls,
    aws: async (args: string[]) => {
      calls.push(args);
      if (args[1] === 'describe-stacks') return stack(resources);
      if (args[1] === 'describe-db-instances')
        return { DBInstances: [{ DBInstanceStatus: status }] };
      return {};
    },
  };
};
describe('staging park and unpark', () => {
  it('drains compute before stopping the database', async () => {
    const api = stub('available');
    await powerStaging({ operation: 'park', aws: api.aws });
    expect(api.calls.map((call) => call[1])).toEqual([
      'describe-stacks',
      'update-service',
      'describe-db-instances',
      'stop-db-instance',
      'wait',
    ]);
    expect(api.calls[1]).toContain('0');
  });
  it('waits for the database before restoring compute', async () => {
    const api = stub('stopped');
    await powerStaging({ operation: 'unpark', aws: api.aws });
    expect(api.calls.map((call) => call[1])).toEqual([
      'describe-stacks',
      'describe-db-instances',
      'start-db-instance',
      'wait',
      'update-service',
    ]);
    expect(api.calls.at(-1)).toContain('1');
  });
  it('refuses production outputs before making any mutation', async () => {
    const api = stub('available', {
      ...outputs,
      DatabaseIdentifier: 'spoh-prod-platform-datapostgres123',
    });
    await expect(powerStaging({ operation: 'park', aws: api.aws })).rejects.toThrow(
      'staging cluster',
    );
    expect(api.calls).toHaveLength(1);
  });
  it('is idempotent when already parked or unparked and refuses unsafe intermediate states', async () => {
    for (const [operation, status] of [
      ['park', 'stopped'],
      ['unpark', 'available'],
    ]) {
      const api = stub(status!);
      await powerStaging({ operation, aws: api.aws });
      expect(
        api.calls.some((call) => ['start-db-instance', 'stop-db-instance'].includes(call[1]!)),
      ).toBe(false);
    }
    const api = stub('deleting');
    await expect(powerStaging({ operation: 'unpark', aws: api.aws })).rejects.toThrow(
      'Cannot unpark',
    );
    expect(api.calls.some((call) => call[1] === 'update-service')).toBe(false);
  });
});
