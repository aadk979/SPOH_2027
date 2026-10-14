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
const stopped = { desiredCount: 0, runningCount: 0, pendingCount: 0 };
const stub = (statuses: string[], services = [stopped], resources = outputs) => {
  const calls: string[][] = [];
  let elapsed = 0;
  let dbIndex = 0;
  let serviceIndex = 0;
  return {
    calls,
    now: () => elapsed,
    sleep: async (milliseconds: number) => {
      elapsed += milliseconds;
    },
    aws: async (args: string[]) => {
      calls.push(args);
      if (args[1] === 'describe-stacks') return stack(resources);
      if (args[1] === 'describe-db-instances')
        return {
          DBInstances: [
            {
              DBInstanceIdentifier: resources.DatabaseIdentifier,
              DBInstanceStatus: statuses[Math.min(dbIndex++, statuses.length - 1)],
            },
          ],
        };
      if (args[1] === 'describe-services')
        return {
          failures: [],
          services: [
            {
              serviceName: resources.ServiceName,
              ...services[Math.min(serviceIndex++, services.length - 1)],
            },
          ],
        };
      if (args[1] === 'wait') throw new Error('Unsupported waiter must not be used');
      return {};
    },
  };
};
describe('staging park and unpark', () => {
  it('observes zero running and pending tasks before stopping the database and polls until stopped', async () => {
    const api = stub(
      ['available', 'stopping', 'stopped'],
      [{ desiredCount: 0, runningCount: 1, pendingCount: 1 }, stopped],
    );
    await powerStaging({ operation: 'park', ...api });
    expect(api.calls.map((call) => call[1])).toEqual([
      'describe-stacks',
      'update-service',
      'describe-services',
      'describe-services',
      'describe-db-instances',
      'stop-db-instance',
      'describe-db-instances',
      'describe-db-instances',
    ]);
    expect(api.now()).toBe(60_000);
    expect(api.calls[1]).toContain('0');
    for (const call of api.calls.slice(2, 4))
      expect(call).toEqual([
        'ecs',
        'describe-services',
        '--cluster',
        outputs.ClusterName,
        '--services',
        outputs.ServiceName,
      ]);
    for (const call of api.calls.filter((entry) => entry[0] === 'rds'))
      expect(call.slice(-2)).toEqual(['--db-instance-identifier', outputs.DatabaseIdentifier]);
  });
  it('waits through starting and rebooting before restoring compute, with only one database start', async () => {
    const api = stub(['stopped', 'starting', 'rebooting', 'available']);
    await powerStaging({ operation: 'unpark', ...api });
    expect(api.calls.map((call) => call[1])).toEqual([
      'describe-stacks',
      'describe-db-instances',
      'start-db-instance',
      'describe-db-instances',
      'describe-db-instances',
      'describe-db-instances',
      'update-service',
    ]);
    expect(api.now()).toBe(60_000);
    expect(api.calls.at(-1)).toContain('1');
  });
  it.each(['ClusterName', 'ServiceName', 'DatabaseIdentifier'])(
    'refuses non-staging %s before mutation',
    async (key) => {
      const api = stub(['available'], [stopped], { ...outputs, [key]: 'spoh-prod-resource' });
      await expect(powerStaging({ operation: 'park', ...api })).rejects.toThrow('staging cluster');
      expect(api.calls).toHaveLength(1);
    },
  );
  it.each([
    ['park', 'stopped'],
    ['unpark', 'available'],
    ['unpark', 'rebooting'],
  ])('reconciles %s from %s without repeating the database mutation', async (operation, status) => {
    const api = stub([status!, operation === 'park' ? 'stopped' : 'available']);
    await powerStaging({ operation, ...api });
    expect(
      api.calls.some((call) => ['start-db-instance', 'stop-db-instance'].includes(call[1]!)),
    ).toBe(false);
  });
  it.each(['park', 'unpark'])(
    'bounds a stalled %s transition to thirty minutes',
    async (operation) => {
      const api = stub([operation === 'park' ? 'stopping' : 'starting']);
      await expect(powerStaging({ operation, ...api })).rejects.toThrow('Timed out');
      expect(api.now()).toBe(1_800_000);
      expect(
        api.calls.some((call) => ['start-db-instance', 'stop-db-instance'].includes(call[1]!)),
      ).toBe(false);
      if (operation === 'unpark')
        expect(api.calls.some((call) => call[1] === 'update-service')).toBe(false);
    },
  );
  it('bounds compute draining and leaves the database untouched when a task remains', async () => {
    const api = stub(['available'], [{ ...stopped, runningCount: 1 }]);
    await expect(powerStaging({ operation: 'park', ...api })).rejects.toThrow('Timed out');
    expect(api.now()).toBe(1_800_000);
    expect(api.calls.some((call) => call[0] === 'rds')).toBe(false);
  });
  it('refuses an externally changed desired count before touching the database', async () => {
    const api = stub(['available'], [{ ...stopped, desiredCount: 1 }]);
    await expect(powerStaging({ operation: 'park', ...api })).rejects.toThrow('Cannot drain');
    expect(api.calls.some((call) => call[0] === 'rds')).toBe(false);
  });
  it.each(['park', 'unpark'])(
    'refuses an unsafe database state during %s without another mutation',
    async (operation) => {
      const api = stub([operation === 'park' ? 'stopping' : 'starting', 'deleting']);
      await expect(powerStaging({ operation, ...api })).rejects.toThrow(`Cannot ${operation}`);
      expect(
        api.calls.some((call) => ['start-db-instance', 'stop-db-instance'].includes(call[1]!)),
      ).toBe(false);
      if (operation === 'unpark')
        expect(api.calls.some((call) => call[1] === 'update-service')).toBe(false);
    },
  );
  it('does not repeat a failed database mutation or start compute after failure', async () => {
    const api = stub(['stopped']);
    const aws = async (args: string[]) => {
      if (args[1] === 'start-db-instance') {
        api.calls.push(args);
        throw new Error('ambiguous start');
      }
      return api.aws(args);
    };
    await expect(powerStaging({ operation: 'unpark', ...api, aws })).rejects.toThrow(
      'ambiguous start',
    );
    expect(api.calls.map((call) => call[1])).toEqual([
      'describe-stacks',
      'describe-db-instances',
      'start-db-instance',
    ]);
  });
  it('refuses ECS failures or malformed metadata rather than treating it as drained', async () => {
    for (const services of [
      undefined,
      [],
      [{ serviceName: 'foreign', ...stopped }],
      [{ serviceName: outputs.ServiceName, ...stopped, pendingCount: undefined }],
    ]) {
      const api = stub(['available']);
      const aws = (args: string[]) =>
        args[1] === 'describe-services'
          ? Promise.resolve({ services, failures: [] })
          : api.aws(args);
      await expect(powerStaging({ operation: 'park', ...api, aws })).rejects.toThrow(
        'Cannot drain',
      );
      expect(api.calls.some((call) => call[0] === 'rds')).toBe(false);
    }
    const api = stub(['available']);
    const aws = (args: string[]) =>
      args[1] === 'describe-services'
        ? Promise.resolve({
            services: [{ serviceName: outputs.ServiceName, ...stopped }],
            failures: [{}],
          })
        : api.aws(args);
    await expect(powerStaging({ operation: 'park', ...api, aws })).rejects.toThrow('Cannot drain');
  });
  it('refuses missing or foreign database metadata before starting compute', async () => {
    for (const DBInstances of [
      undefined,
      [],
      [{ DBInstanceIdentifier: 'foreign', DBInstanceStatus: 'available' }],
    ]) {
      const api = stub(['available']);
      const aws = (args: string[]) =>
        args[1] === 'describe-db-instances' ? Promise.resolve({ DBInstances }) : api.aws(args);
      await expect(powerStaging({ operation: 'unpark', ...api, aws })).rejects.toThrow(
        'database metadata',
      );
      expect(api.calls.some((call) => call[1] === 'update-service')).toBe(false);
    }
  });
});
