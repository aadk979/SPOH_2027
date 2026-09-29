/**
 * Run the release's migrate task and wait for it (P08.4): roles, then
 * `prisma migrate deploy`, then grants. Exits non-zero unless the task stopped
 * with exit code 0, so the workflow never moves the service over a failed
 * migration.
 *
 *   node infra/scripts/run-migrate-task.mjs outputs.json Spoh-staging-Platform
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [outputsFile, stack] = process.argv.slice(2);
const outputs = JSON.parse(readFileSync(outputsFile, 'utf8'))[stack];
const aws = (...args) =>
  JSON.parse(execFileSync('aws', [...args, '--output', 'json'], { encoding: 'utf8' }));

const network = `awsvpcConfiguration={subnets=[${outputs.AppSubnets}],securityGroups=[${outputs.AppSecurityGroup}],assignPublicIp=ENABLED}`;
const started = aws(
  'ecs',
  'run-task',
  '--cluster',
  outputs.ClusterName,
  '--task-definition',
  outputs.MigrateTaskDefinition,
  '--launch-type',
  'FARGATE',
  '--network-configuration',
  network,
);
const taskArn = started.tasks?.[0]?.taskArn;
if (!taskArn)
  throw new Error(`the migrate task did not start: ${JSON.stringify(started.failures)}`);
console.log(`migrate task ${taskArn}`);

execFileSync(
  'aws',
  ['ecs', 'wait', 'tasks-stopped', '--cluster', outputs.ClusterName, '--tasks', taskArn],
  {
    stdio: 'inherit',
  },
);
const [task] = aws(
  'ecs',
  'describe-tasks',
  '--cluster',
  outputs.ClusterName,
  '--tasks',
  taskArn,
).tasks;
const exitCode = task.containers?.[0]?.exitCode;
console.log(`migrate task stopped: ${task.stoppedReason ?? ''} (exit ${exitCode})`);
if (exitCode !== 0) process.exit(1);
