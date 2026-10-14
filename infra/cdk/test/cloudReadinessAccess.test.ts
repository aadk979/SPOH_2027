import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { PlatformStack } from '../src/platformStack.js';
import { readinessAlarmNames } from '../src/readinessAccess.js';
import type { StageName } from '../src/config.js';

const sha = 'a'.repeat(40);
const app = buildApp(new App({ context: { imageTag: sha, serviceImageTag: sha,
  '@aws-cdk/core:enablePartitionLiterals': true } }));
const templateFor = (stage: StageName) => Template.fromStack(
  app.node.findChild(`Spoh-${stage}-Platform`) as PlatformStack);

it.each(['staging', 'prod'] as const)('selects every actual %s metric alarm, without weakening the required catalogue', stage => {
  const template = templateFor(stage);
  const names = Object.values(template.findResources('AWS::CloudWatch::Alarm'))
    .map(row => row.Properties.AlarmName);
  expect(names.sort()).toEqual(readinessAlarmNames(stage).sort());
  expect(names).toHaveLength(20);
});

it.each(['staging', 'prod'] as const)('gives %s app only its own database and all exact alarm reads', stage => {
  const template = templateFor(stage);
  const policies = Object.values(template.findResources('AWS::IAM::Policy'));
  const readPolicies = policies.flatMap(row => row.Properties.PolicyDocument.Statement)
    .filter((row: { Action: unknown }) => JSON.stringify(row.Action).includes('rds:DescribeDBInstances'));
  expect(readPolicies).toHaveLength(1);
  expect(readPolicies[0].Action).toBe('rds:DescribeDBInstances');
  const databaseId = Object.keys(template.findResources('AWS::RDS::DBInstance'))[0]!;
  expect(readPolicies[0].Resource).toEqual({ 'Fn::Join': ['', [
    'arn:aws:rds:ap-southeast-1:665146708212:db:', { Ref: databaseId },
  ]] });
  const alarms = policies.flatMap(row => row.Properties.PolicyDocument.Statement)
    .filter((row: { Action: unknown }) => JSON.stringify(row.Action).includes('cloudwatch:DescribeAlarms'));
  expect(alarms).toHaveLength(1);
  expect([...alarms[0].Resource].sort()).toEqual(readinessAlarmNames(stage).map(name =>
    `arn:aws:cloudwatch:ap-southeast-1:665146708212:alarm:${name}`).sort());
  const tasks = Object.values(template.findResources('AWS::ECS::TaskDefinition'));
  const task = tasks.find(row => row.Properties.ContainerDefinitions[0].Name === 'app')!;
  const environment = task.Properties.ContainerDefinitions[0].Environment;
  const config = environment.find((row: { Name: string }) => row.Name === 'READINESS_CLOUD_CONFIG');
  expect(config).toBeDefined();
  expect(JSON.stringify(config.Value)).toContain(sha);
  expect(JSON.stringify(config.Value)).toContain('300000');
  const alarmIds = Object.keys(template.findResources('AWS::CloudWatch::Alarm'));
  for (const id of alarmIds) expect(JSON.stringify(config.Value)).not.toContain(id);
  const migrate = tasks.find(row => row.Properties.ContainerDefinitions[0].Name === 'migrate')!;
  expect(JSON.stringify(migrate.Properties.ContainerDefinitions[0].Environment ?? [])).not.toContain('READINESS_CLOUD_CONFIG');
});

it.each(['staging', 'prod'] as const)('replaces %s Backup wildcard with its own native automated snapshot namespace', stage => {
  const template = templateFor(stage);
  const statements = Object.values(template.findResources('AWS::IAM::Policy'))
    .flatMap(row => row.Properties.PolicyDocument.Statement);
  expect(JSON.stringify(statements)).not.toContain('backup:ListRecoveryPointsByResource');
  const snapshots = statements.filter((row: { Action: unknown }) =>
    JSON.stringify(row.Action).includes('rds:DescribeDBSnapshots'));
  expect(snapshots).toHaveLength(1);
  const databaseId = Object.keys(template.findResources('AWS::RDS::DBInstance'))[0]!;
  expect(snapshots[0].Resource[0]).toEqual({ 'Fn::Join': ['', [
    'arn:aws:rds:ap-southeast-1:665146708212:db:', { Ref: databaseId },
  ]] });
  expect(JSON.stringify(snapshots[0].Resource[1])).toContain(':snapshot:rds:');
  expect(JSON.stringify(snapshots[0].Resource[1])).toContain(databaseId);
  expect(JSON.stringify(snapshots[0].Resource)).not.toBe('["*"]');
  const observer = Object.values(template.findResources('AWS::Lambda::Function'))[0]!;
  expect(observer.Properties.Environment.Variables.DATABASE_IDENTIFIER).toEqual({ Ref: databaseId });
  expect(observer.Properties.Environment.Variables.SERVICE_ARN).toBeDefined();
});

it('synthesises both real stacks with nag and no alarm/service/task dependency cycle', () => {
  const assembly = app.synth();
  for (const stage of ['staging', 'prod'] as const) {
    const resources = templateFor(stage).toJSON().Resources as Record<string, unknown>;
    expect(assembly.getStackByName(`Spoh-${stage}-Platform`).template.Resources).toEqual(resources);
  }
});
