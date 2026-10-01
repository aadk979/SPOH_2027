/**
 * Run the release's migrate task and wait for it (P08.4): roles, then
 * `prisma migrate deploy`, then grants. Exits non-zero unless the task stopped
 * with exit code 0, so the workflow never moves the service over a failed
 * migration.
 *
 *   node infra/scripts/run-migrate-task.mjs outputs.json Spoh-staging-Platform
 *
 * The same task definition runs the entrypoint's one-off commands, `seed`
 * (P08.10) and the read-only `totals` check (P09.4): name one after the stack,
 * and pass `-` for the outputs file to read them from CloudFormation instead.
 * The task's log is printed once it stops.
 *
 *   node infra/scripts/run-migrate-task.mjs - Spoh-staging-Platform totals
 *   node infra/scripts/run-migrate-task.mjs - Spoh-staging-Platform seed-fixture
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [outputsFile, stack, ...requestedCommand] = process.argv.slice(2);
const fixture = requestedCommand.length === 1 && requestedCommand[0] === 'seed-fixture';
if (fixture && stack !== 'Spoh-staging-Platform') {
  throw new Error('seed-fixture is only permitted for Spoh-staging-Platform');
}
const command = fixture ? ['seed'] : requestedCommand;
const aws = (...args) =>
  JSON.parse(execFileSync('aws', [...args, '--output', 'json'], { encoding: 'utf8' }));

function stackOutputs() {
  if (outputsFile !== '-') return JSON.parse(readFileSync(outputsFile, 'utf8'))[stack];
  const [described] = aws('cloudformation', 'describe-stacks', '--stack-name', stack).Stacks;
  return Object.fromEntries(described.Outputs.map((o) => [o.OutputKey, o.OutputValue]));
}

/** Best effort: the task's own log, so a one-off's result is in this output. */
function printLog(taskDefinition, taskArn) {
  try {
    const [container] = aws('ecs', 'describe-task-definition', '--task-definition', taskDefinition)
      .taskDefinition.containerDefinitions;
    const options = container.logConfiguration.options;
    const stream = `${options['awslogs-stream-prefix']}/${container.name}/${taskArn.split('/').pop()}`;
    const { events } = aws(
      'logs',
      'get-log-events',
      '--log-group-name',
      options['awslogs-group'],
      '--log-stream-name',
      stream,
      '--start-from-head',
    );
    for (const event of events) console.log(`  | ${event.message}`);
  } catch (error) {
    console.log(`(task log unavailable: ${error.message.split('\n')[0]})`);
  }
}

const outputs = stackOutputs();
if (
  fixture &&
  (!outputs.ClusterName?.startsWith('Spoh-staging-') ||
    !outputs.MigrateTaskDefinition?.includes('task-definition/spoh-staging-migrate:'))
) {
  throw new Error('seed-fixture requires the staging cluster and staging task definition');
}
const network = `awsvpcConfiguration={subnets=[${outputs.AppSubnets}],securityGroups=[${outputs.AppSecurityGroup}],assignPublicIp=ENABLED}`;
const overrides = command.length
  ? [
      '--overrides',
      JSON.stringify({
        containerOverrides: [
          {
            name: 'migrate',
            command,
            // Staging alone gets the two synthetic event fixtures; production
            // seed remains administrator-only (D-12, P08.10).
            ...(fixture ? { environment: [{ name: 'NODE_ENV', value: 'development' }] } : {}),
          },
        ],
      }),
    ]
  : [];
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
  ...overrides,
);
const taskArn = started.tasks?.[0]?.taskArn;
if (!taskArn) throw new Error(`the task did not start: ${JSON.stringify(started.failures)}`);
const label = fixture ? 'seed-fixture' : command.length ? command.join(' ') : 'migrate';
console.log(`${label} task ${taskArn}`);

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
printLog(outputs.MigrateTaskDefinition, taskArn);
const exitCode = task.containers?.[0]?.exitCode;
console.log(`${label} task stopped: ${task.stoppedReason ?? ''} (exit ${exitCode})`);
if (exitCode !== 0) process.exit(1);
