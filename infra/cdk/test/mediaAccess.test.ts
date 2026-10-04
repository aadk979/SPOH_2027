import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { PlatformStack } from '../src/platformStack.js';
import type { StageName } from '../src/config.js';

const app = buildApp(
  new App({
    context: {
      imageTag: 'verified-release',
      serviceImageTag: 'verified-release',
    },
  }),
);
function templateFor(stage: StageName) {
  const stack = app.node.findChild(`Spoh-${stage}-Platform`);
  if (!(stack instanceof PlatformStack)) throw new Error('Missing platform stack');
  return Template.fromStack(stack);
}
function taskFor(template: Template, name: string) {
  const task = Object.values(template.findResources('AWS::ECS::TaskDefinition')).find((row) =>
    row.Properties.ContainerDefinitions.some(
      (container: { Name: string }) => container.Name === name,
    ),
  );
  if (!task) throw new Error(`Missing ${name} task`);
  return task.Properties;
}
function objectPolicies(template: Template, role: unknown) {
  return Object.values(template.findResources('AWS::IAM::Policy'))
    .filter((row) =>
      row.Properties.Roles.some((entry: { Ref: string }) =>
        JSON.stringify(role).includes(entry.Ref),
      ),
    )
    .flatMap((row) => row.Properties.PolicyDocument.Statement as Array<Record<string, unknown>>)
    .filter((statement) => JSON.stringify(statement.Action).includes('s3:'));
}

it('grants the staging app only photo-prefix GetObject and PutObject', () => {
  const template = templateFor('staging');
  const mediaId = Object.keys(template.findResources('AWS::S3::Bucket')).find((id) =>
    id.startsWith('StorageMedia'),
  );
  expect(mediaId).toBeDefined();
  expect(objectPolicies(template, taskFor(template, 'app').TaskRoleArn)).toEqual([
    {
      Effect: 'Allow',
      Action: ['s3:GetObject', 's3:PutObject'],
      Resource: { 'Fn::Join': ['', [{ 'Fn::GetAtt': [mediaId, 'Arn'] }, '/lost-found/*']] },
    },
  ]);
  expect(objectPolicies(template, taskFor(template, 'app').ExecutionRoleArn)).toEqual([]);
});
it('injects the owned media bucket through one standard staging SSM parameter', () => {
  const template = templateFor('staging');
  const mediaId = Object.keys(template.findResources('AWS::S3::Bucket')).find((id) =>
    id.startsWith('StorageMedia'),
  );
  const parameters = Object.entries(template.findResources('AWS::SSM::Parameter'));
  const parameter = parameters.find(
    ([, row]) => row.Properties.Name === '/spoh/staging/infra/S3_MEDIA_BUCKET',
  );
  expect(parameter?.[1].Properties).toMatchObject({
    Type: 'String',
    Tier: 'Standard',
    Value: { Ref: mediaId },
  });
  const secrets = taskFor(template, 'app').ContainerDefinitions[0].Secrets as Array<{
    Name: string;
    ValueFrom: unknown;
  }>;
  expect(secrets.find((secret) => secret.Name === 'S3_MEDIA_BUCKET')?.ValueFrom).toBeDefined();
  expect(
    JSON.stringify(secrets.find((secret) => secret.Name === 'S3_MEDIA_BUCKET')?.ValueFrom),
  ).toContain(parameter?.[0]);
});
it('keeps migration roles and configuration free of storage access', () => {
  for (const stage of ['staging', 'prod'] as const) {
    const template = templateFor(stage);
    const task = taskFor(template, 'migrate');
    expect(objectPolicies(template, task.TaskRoleArn)).toEqual([]);
    expect(objectPolicies(template, task.ExecutionRoleArn)).toEqual([]);
    expect(JSON.stringify(task.ContainerDefinitions)).not.toMatch(/S3_MEDIA_BUCKET|StorageMedia/);
  }
});
it('keeps production media disabled until its approved exact public origin exists', () => {
  const template = templateFor('prod');
  const task = taskFor(template, 'app');
  expect(objectPolicies(template, task.TaskRoleArn)).toEqual([]);
  expect(JSON.stringify(task.ContainerDefinitions)).not.toContain('S3_MEDIA_BUCKET');
  for (const row of Object.values(template.findResources('AWS::SSM::Parameter')))
    expect(row.Properties.Name).not.toContain('S3_MEDIA_BUCKET');
});
it('passes nag with the justified photo object-prefix grant', () => {
  expect(() => app.synth()).not.toThrow();
});
