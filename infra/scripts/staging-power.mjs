import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleepDefault } from 'node:timers/promises';

const STACK = 'Spoh-staging-Platform';
const POLL_INTERVAL_MS = 30_000;
const TIMEOUT_MS = 30 * 60_000;

function stagingResources(outputs) {
  const { ClusterName, ServiceName, DatabaseIdentifier } = outputs;
  if (
    ![ClusterName, ServiceName].every((value) =>
      /^Spoh-staging-Platform-[A-Za-z0-9-]+$/.test(value ?? ''),
    ) ||
    !/^spoh-staging-platform-datapostgres[a-z0-9-]+$/.test(DatabaseIdentifier ?? '')
  )
    throw new Error('Power operation requires the staging cluster, service and database');
  return { ClusterName, ServiceName, DatabaseIdentifier };
}

/** Park stops compute first; unpark restores the database before starting requests. */
export async function powerStaging({
  operation,
  aws,
  now = () => performance.now(),
  sleep = sleepDefault,
}) {
  if (!['park', 'unpark'].includes(operation)) throw new Error('operation must be park or unpark');
  const stack = await aws(['cloudformation', 'describe-stacks', '--stack-name', STACK]);
  const outputs = Object.fromEntries(
    stack.Stacks[0].Outputs.map((row) => [row.OutputKey, row.OutputValue]),
  );
  const { ClusterName, ServiceName, DatabaseIdentifier } = stagingResources(outputs);
  const service = (count) =>
    aws([
      'ecs',
      'update-service',
      '--cluster',
      ClusterName,
      '--service',
      ServiceName,
      '--desired-count',
      String(count),
    ]);
  const poll = async (label, ready) => {
    const deadline = now() + TIMEOUT_MS;
    while (now() < deadline) {
      if (await ready()) return;
      await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - now())));
    }
    throw new Error(`Timed out waiting for ${label}; reconcile before repeating the operation`);
  };
  const database = async () => {
    const result = await aws([
      'rds',
      'describe-db-instances',
      '--db-instance-identifier',
      DatabaseIdentifier,
    ]);
    const instances = result.DBInstances;
    if (
      instances?.length !== 1 ||
      instances[0].DBInstanceIdentifier !== DatabaseIdentifier ||
      typeof instances[0].DBInstanceStatus !== 'string'
    )
      throw new Error('Cannot verify staging database metadata');
    return instances[0].DBInstanceStatus;
  };
  const waitForDatabase = (target, transitions) =>
    poll(`database ${target}`, async () => {
      const status = await database();
      if (status === target) return true;
      if (!transitions.includes(status))
        throw new Error(`Cannot ${operation} database in ${status}`);
      return false;
    });
  if (operation === 'park') {
    await service(0);
    await poll('staging compute to drain', async () => {
      const result = await aws([
        'ecs',
        'describe-services',
        '--cluster',
        ClusterName,
        '--services',
        ServiceName,
      ]);
      const services = result.services;
      const current = services?.[0];
      if (
        result.failures?.length ||
        services?.length !== 1 ||
        current.serviceName !== ServiceName ||
        current.desiredCount !== 0 ||
        ![current.runningCount, current.pendingCount].every(
          (count) => Number.isInteger(count) && count >= 0,
        )
      )
        throw new Error('Cannot drain the exact staging service');
      return current.runningCount === 0 && current.pendingCount === 0;
    });
    const status = await database();
    if (status === 'available')
      await aws(['rds', 'stop-db-instance', '--db-instance-identifier', DatabaseIdentifier]);
    else if (!['stopped', 'stopping'].includes(status))
      throw new Error(`Cannot park database in ${status}`);
    // AWS CLI has no db-instance-stopped waiter; observe bounded metadata instead.
    await waitForDatabase('stopped', ['available', 'stopping']);
    return;
  }
  const status = await database();
  if (status === 'stopped')
    await aws(['rds', 'start-db-instance', '--db-instance-identifier', DatabaseIdentifier]);
  else if (!['available', 'starting', 'rebooting'].includes(status))
    throw new Error(`Cannot unpark database in ${status}`);
  await waitForDatabase('available', ['stopped', 'starting', 'rebooting']);
  await service(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await powerStaging({
    operation: process.argv[2],
    aws: async (args) => {
      const output = execFileSync(
        'aws',
        [
          ...args,
          '--region',
          'ap-southeast-1',
          '--output',
          'json',
          '--no-cli-pager',
          '--cli-connect-timeout',
          '10',
          '--cli-read-timeout',
          '30',
        ],
        { encoding: 'utf8', timeout: 45_000, env: { ...process.env, AWS_MAX_ATTEMPTS: '1' } },
      );
      return output.trim() ? JSON.parse(output) : {};
    },
  });
  console.log(`Staging ${process.argv[2]} completed.`);
}
