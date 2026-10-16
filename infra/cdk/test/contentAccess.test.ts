import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { PlatformStack } from '../src/platformStack.js';

const app = buildApp(
  new App({ context: { imageTag: 'verified-release', serviceImageTag: 'verified-release' } }),
);
const stack = app.node.findChild('Spoh-staging-Platform');
if (!(stack instanceof PlatformStack)) throw new Error('Missing platform stack');
const template = Template.fromStack(stack);
function taskFor(name: string) {
  return Object.values(template.findResources('AWS::ECS::TaskDefinition')).find((row) =>
    row.Properties.ContainerDefinitions.some(
      (container: { Name: string }) => container.Name === name,
    ),
  )!.Properties;
}
function objectStatements(name: string) {
  const task = taskFor(name);
  return Object.values(template.findResources('AWS::IAM::Policy'))
    .filter((row) =>
      row.Properties.Roles.some((role: { Ref: string }) =>
        JSON.stringify(task.TaskRoleArn).includes(role.Ref),
      ),
    )
    .flatMap(
      (row) =>
        row.Properties.PolicyDocument.Statement as Array<{
          Action: string | string[];
          Resource: unknown;
          Condition?: unknown;
        }>,
    )
    .filter((row) => JSON.stringify(row.Action).includes('s3:'));
}
it('limits publication and clone access to generated drafts/content prefixes in the versioned private bucket', () => {
  const id = Object.keys(template.findResources('AWS::S3::Bucket')).find((key) =>
    key.startsWith('StorageContent'),
  )!;
  template.hasResourceProperties('AWS::S3::Bucket', {
    VersioningConfiguration: { Status: 'Enabled' },
  });
  const policies = objectStatements('app').filter((row) =>
    JSON.stringify(row.Resource).includes(id),
  );
  const existence = policies.filter(
    (row) =>
      row.Action === 's3:ListBucket' ||
      (Array.isArray(row.Action) && row.Action.includes('s3:ListBucket')),
  );
  expect(existence).toHaveLength(1);
  expect(existence[0]!.Resource).toEqual({ 'Fn::GetAtt': [id, 'Arn'] });
  expect(existence[0]!.Condition).toEqual({
    StringLike: { 's3:prefix': ['drafts/*', 'content/*'] },
  });
  const objects = policies.filter((row) => !existence.includes(row));
  expect(objects).toHaveLength(2);
  for (const row of objects)
    expect(row.Action).toEqual([
      's3:GetObject',
      's3:GetObjectVersion',
      's3:PutObject',
      's3:DeleteObject',
      's3:DeleteObjectVersion',
    ]);
  expect(policies.map((row) => JSON.stringify(row.Resource)).join(' ')).toContain('/drafts/*');
  expect(policies.map((row) => JSON.stringify(row.Resource)).join(' ')).toContain('/content/*');
  expect(JSON.stringify(objects)).not.toMatch(/List|Acl/);
  expect(JSON.stringify(policies)).not.toMatch(/ListBucketVersions|s3:ListAllMyBuckets|Acl/);
});
it('limits final exports to private archive objects and keeps migration roles free of S3', () => {
  const id = Object.keys(template.findResources('AWS::S3::Bucket')).find((key) =>
    key.startsWith('StorageExports'),
  )!;
  expect(
    objectStatements('app').filter((row) => JSON.stringify(row.Resource).includes(id)),
  ).toEqual([
    {
      Effect: 'Allow',
      Action: ['s3:GetObject', 's3:PutObject'],
      Resource: [
        { 'Fn::Join': ['', [{ 'Fn::GetAtt': [id, 'Arn'] }, '/archive/*']] },
        { 'Fn::Join': ['', [{ 'Fn::GetAtt': [id, 'Arn'] }, '/card-print/*']] },
      ],
    },
  ]);
  expect(objectStatements('migrate')).toEqual([]);
  expect(JSON.stringify(taskFor('migrate'))).not.toMatch(/S3_CONTENT_BUCKET|S3_EXPORTS_BUCKET/);
  const parameters = Object.values(template.findResources('AWS::SSM::Parameter')).map(
    (row) => row.Properties.Name,
  );
  expect(parameters).toContain('/spoh/staging/infra/S3_CONTENT_BUCKET');
  expect(parameters).toContain('/spoh/staging/infra/S3_EXPORTS_BUCKET');
});
it('passes the scoped content/export IAM and storage nag validation', () => {
  expect(() => app.synth()).not.toThrow();
});
