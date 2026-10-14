import { ArnFormat, Stack } from 'aws-cdk-lib';
import type { FargateTaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { IDatabaseInstance } from 'aws-cdk-lib/aws-rds';
import type { StageConfig, StageName } from './config.js';

/** Tests bind this required catalogue to every actual metric alarm, without resource references. */
export const READINESS_ALARM_SUFFIXES = [
  'authorization-failed', 'authorization-denial-volume', 'authorization-denial-ratio',
  'avp-failed', 'avp-throttled', 'avp-latency-p95', 'authorization-degraded',
  'cache-bus-degraded', 'http-5xx-rate', 'http-p95-latency', 'task-failure',
  'scheduler-lag', 'scheduler-dead', 'rds-cpu', 'rds-free-storage', 'rds-connections',
  'permission-policy-change', 'running-tasks', 'backup-age', 'monitoring-failed',
] as const;

export function readinessAlarmNames(stage: StageName): string[] {
  return READINESS_ALARM_SUFFIXES.map(suffix => `spoh-${stage}-${suffix}`);
}

/** Immutable task configuration avoids both mutable-release SSM selection and an alarm/service cycle. */
export function configureCloudReadiness(task: FargateTaskDefinition,
  input: { stage: StageConfig; database: IDatabaseInstance; nativeOrigin: string; deploymentId: string }) {
  const stack = Stack.of(task);
  const requiredAlarmIds = readinessAlarmNames(input.stage.name).map(name => stack.formatArn({
    arnFormat: ArnFormat.COLON_RESOURCE_NAME, service: 'cloudwatch', resource: 'alarm', resourceName: name,
  }));
  task.defaultContainer!.addEnvironment('READINESS_CLOUD_CONFIG', stack.toJsonString({
    region: input.stage.region, account: input.stage.account, nativeOrigin: input.nativeOrigin,
    deploymentId: input.deploymentId, databaseIdentifier: input.database.instanceIdentifier,
    databaseId: input.database.instanceArn, requiredAlarmIds,
    freshness: { smokeMaxAgeMs: 300_000, backupMaxAgeMs: 300_000, alarmsMaxAgeMs: 300_000 },
  }));
  task.taskRole.addToPrincipalPolicy(new PolicyStatement({
    actions: ['rds:DescribeDBInstances'], resources: [input.database.instanceArn],
  }));
  task.taskRole.addToPrincipalPolicy(new PolicyStatement({
    actions: ['cloudwatch:DescribeAlarms'], resources: requiredAlarmIds,
  }));
}
