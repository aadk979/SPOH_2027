import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { STAGES, type StageName } from '../src/config.js';
import { ObjectStorage } from '../src/objectStorage.js';
import { PlatformStack } from '../src/platformStack.js';

interface Statement {
  Effect: string;
  Action: string | string[];
  Principal: unknown;
  Resource: unknown;
  Condition?: Record<string, unknown>;
}
interface BucketPolicy {
  Bucket: { Ref: string };
  PolicyDocument: { Statement: Statement[] };
}
interface BucketResource {
  Properties: Record<string, unknown> & { LifecycleConfiguration: { Rules: unknown[] } };
  DeletionPolicy: string;
  UpdateReplacePolicy: string;
}
const app = buildApp(
  new App({
    context: {
      imageTag: 'verified-release',
      serviceImageTag: 'verified-release',
      // The construct must stay private even when an enclosing app has an older flag.
      '@aws-cdk/aws-s3:serverAccessLogsUseBucketPolicy': false,
    },
  }),
);
function templateFor(stage: StageName) {
  const stack = app.node.findChild(`Spoh-${stage}-Platform`);
  if (!(stack instanceof PlatformStack)) throw new Error('Expected platform stack');
  return Template.fromStack(stack);
}
function bucketFor(template: Template, name: string) {
  const bucket = Object.entries(template.findResources('AWS::S3::Bucket')).find(([id]) =>
    id.startsWith(`Storage${name}`),
  );
  if (!bucket) throw new Error(`Missing ${name} bucket`);
  return { id: bucket[0], ...(bucket[1] as BucketResource) };
}
function policyFor(template: Template, id: string) {
  const policy = Object.values(template.findResources('AWS::S3::BucketPolicy'))
    .map((resource) => resource.Properties as BucketPolicy)
    .find((resource) => resource.Bucket.Ref === id);
  if (!policy) throw new Error('Missing bucket policy');
  return policy.PolicyDocument.Statement;
}

describe('private object storage foundation (P08.7)', () => {
  it('passes nag validation without allowing ACL based log delivery', () => {
    expect(() => app.synth()).not.toThrow();
  });

  it.each(['staging', 'prod'] as const)(
    'blocks anonymous access, ACLs and plaintext transport for every %s bucket',
    (stage) => {
      const template = templateFor(stage);
      template.resourceCountIs('AWS::S3::Bucket', 4);
      template.resourceCountIs('AWS::S3::BucketPolicy', 4);
      for (const name of ['Media', 'Content', 'Exports', 'AccessLogs']) {
        const bucket = bucketFor(template, name);
        expect(bucket.Properties).toMatchObject({
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            IgnorePublicAcls: true,
            BlockPublicPolicy: true,
            RestrictPublicBuckets: true,
          },
          OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
          BucketEncryption: {
            ServerSideEncryptionConfiguration: [
              { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
            ],
          },
        });
        expect(bucket.Properties.AccessControl).toBeUndefined();
        expect(bucket.DeletionPolicy).toBe('Retain');
        expect(bucket.UpdateReplacePolicy).toBe('Retain');
        const statements = policyFor(template, bucket.id);
        expect(statements).toContainEqual({
          Effect: 'Deny',
          Action: 's3:*',
          Principal: { AWS: '*' },
          Resource: [
            { 'Fn::GetAtt': [bucket.id, 'Arn'] },
            { 'Fn::Join': ['', [{ 'Fn::GetAtt': [bucket.id, 'Arn'] }, '/*']] },
          ],
          Condition: { Bool: { 'aws:SecureTransport': 'false' } },
        });
        if (name !== 'AccessLogs')
          expect(statements.every((row) => row.Effect === 'Deny')).toBe(true);
      }
      template.resourceCountIs('Custom::S3AutoDeleteObjects', 0);
    },
  );

  it.each(['staging', 'prod'] as const)(
    'accepts log delivery only from the three owned %s data buckets and their prefixes',
    (stage) => {
      const template = templateFor(stage);
      const logs = bucketFor(template, 'AccessLogs');
      const grants = policyFor(template, logs.id).filter((row) => row.Effect === 'Allow');
      expect(grants).toHaveLength(3);
      for (const name of ['Media', 'Content', 'Exports']) {
        const bucket = bucketFor(template, name);
        const prefix = `${name.toLowerCase()}/`;
        expect(bucket.Properties.LoggingConfiguration).toEqual({
          DestinationBucketName: { Ref: logs.id },
          LogFilePrefix: prefix,
        });
        expect(grants).toContainEqual({
          Effect: 'Allow',
          Action: 's3:PutObject',
          Principal: { Service: 'logging.s3.amazonaws.com' },
          Resource: { 'Fn::Join': ['', [{ 'Fn::GetAtt': [logs.id, 'Arn'] }, `/${prefix}*`]] },
          Condition: {
            ArnLike: { 'aws:SourceArn': { 'Fn::GetAtt': [bucket.id, 'Arn'] } },
            StringEquals: { 'aws:SourceAccount': STAGES[stage].account },
          },
        });
      }
    },
  );

  it('allows signed media POSTs from the exact staging client origin only', () => {
    const template = templateFor('staging');
    expect(bucketFor(template, 'Media').Properties.CorsConfiguration).toEqual({
      CorsRules: [
        {
          AllowedOrigins: ['https://secure-channel.duckdns.org'],
          AllowedMethods: ['POST'],
          AllowedHeaders: ['Content-Type'],
          MaxAge: 300,
        },
      ],
    });
    expect(bucketFor(template, 'Content').Properties.CorsConfiguration).toEqual(
      bucketFor(template, 'Media').Properties.CorsConfiguration,
    );
    for (const name of ['Exports', 'AccessLogs'])
      expect(bucketFor(template, name).Properties.CorsConfiguration).toBeUndefined();
    expect(bucketFor(templateFor('prod'), 'Media').Properties.CorsConfiguration).toBeUndefined();
  });

  it.each([
    'http://client.example',
    'https://*.example',
    'https://client.example/',
    'https://client.example/path',
    'https://name:password@client.example',
    'https://client.example?origin=*',
  ])('refuses an unsafe or non-origin CORS value: %s', (client) => {
    const stack = new Stack(new App(), 'InvalidOrigin');
    expect(
      () =>
        new ObjectStorage(stack, 'Storage', {
          ...STAGES.staging,
          publicOrigins: { api: STAGES.staging.publicOrigins!.api, client },
        }),
    ).toThrow();
  });

  it('retains content history and avoids deleting media from upload age', () => {
    const template = templateFor('staging');
    const abort = {
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
      Id: 'abort-incomplete-multipart',
      Status: 'Enabled',
    };
    for (const name of ['Media', 'Content'])
      expect(bucketFor(template, name).Properties.LifecycleConfiguration.Rules).toEqual([abort]);
    expect(bucketFor(template, 'Content').Properties.VersioningConfiguration).toEqual({
      Status: 'Enabled',
    });
    expect(bucketFor(template, 'Exports').Properties.LifecycleConfiguration.Rules).toEqual([
      abort,
      { ExpirationInDays: 90, Id: 'expired-exports', Status: 'Enabled' },
    ]);
    expect(bucketFor(template, 'AccessLogs').Properties.LifecycleConfiguration.Rules).toEqual([
      abort,
      { ExpirationInDays: 30, Id: 'expired-access-logs', Status: 'Enabled' },
    ]);
  });

  it.each(['staging', 'prod'] as const)(
    'references existing backups without taking ownership or giving %s tasks backup access',
    (stage) => {
      const template = templateFor(stage);
      const resources = JSON.stringify(template.toJSON().Resources);
      expect(resources).not.toContain(STAGES[stage].existingBackupsBucket);
      template.hasOutput('ExistingBackupsBucketName', {
        Value: STAGES[stage].existingBackupsBucket,
      });
      for (const resource of Object.values(template.findResources('AWS::IAM::Policy')))
        expect(JSON.stringify(resource.Properties.PolicyDocument)).not.toContain(
          STAGES[stage].existingBackupsBucket,
        );
      for (const resource of Object.values(template.findResources('AWS::ECS::TaskDefinition')))
        expect(JSON.stringify(resource.Properties.ContainerDefinitions)).not.toMatch(
          /BACKUPS_BUCKET|AWS_ACCESS_KEY/,
        );
    },
  );
});
