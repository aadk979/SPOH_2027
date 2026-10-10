import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const STACK = 'Spoh-staging-Platform';

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
export async function powerStaging({ operation, aws }) {
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
  const database = async () =>
    (await aws(['rds', 'describe-db-instances', '--db-instance-identifier', DatabaseIdentifier]))
      .DBInstances[0].DBInstanceStatus;
  const wait = (status) =>
    aws(['rds', 'wait', `db-instance-${status}`, '--db-instance-identifier', DatabaseIdentifier]);
  if (operation === 'park') {
    await service(0);
    const status = await database();
    if (status === 'available')
      await aws(['rds', 'stop-db-instance', '--db-instance-identifier', DatabaseIdentifier]);
    else if (!['stopped', 'stopping'].includes(status))
      throw new Error(`Cannot park database in ${status}`);
    await wait('stopped');
    return;
  }
  const status = await database();
  if (status === 'stopped')
    await aws(['rds', 'start-db-instance', '--db-instance-identifier', DatabaseIdentifier]);
  else if (!['available', 'starting'].includes(status))
    throw new Error(`Cannot unpark database in ${status}`);
  await wait('available');
  await service(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await powerStaging({
    operation: process.argv[2],
    aws: async (args) => {
      const output = execFileSync(
        'aws',
        [...args, '--region', 'ap-southeast-1', '--output', 'json'],
        { encoding: 'utf8' },
      );
      return output.trim() ? JSON.parse(output) : {};
    },
  });
  console.log(`Staging ${process.argv[2]} completed.`);
}
