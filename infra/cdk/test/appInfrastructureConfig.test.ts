import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { PlatformStack } from '../src/platformStack.js';
import type { StageName } from '../src/config.js';

const app = buildApp(
  new App({ context: { imageTag: 'verified-release', serviceImageTag: 'verified-release' } }),
);
const INFRA_NAMES = [
  'APP_BASE_URL',
  'AUTH_PROVIDER',
  'AWS_REGION',
  'COGNITO_CLIENT_ID',
  'COGNITO_DOMAIN',
  'COGNITO_REGION',
  'COGNITO_USER_POOL_ID',
  'CORS_ALLOWED_ORIGINS',
  'DB_HOST',
  'DB_NAME',
  'LOG_LEVEL',
  'NODE_ENV',
  'PORT',
  'TRUST_PROXY_HOPS',
];
const STAGING_INFRA_NAMES = [...INFRA_NAMES, 'CLIENT_BASE_URL', 'DEPLOYMENT_ENV'].sort();
interface Container {
  Name: string;
  Environment?: Array<{ Name: string; Value: unknown }>;
  Secrets: Array<{ Name: string; ValueFrom: unknown }>;
  PortMappings?: Array<{ ContainerPort: number }>;
}
interface Task {
  ContainerDefinitions: Container[];
  ExecutionRoleArn: unknown;
  TaskRoleArn: unknown;
}
interface Statement {
  Action: string | string[];
  Resource: unknown | unknown[];
}
interface Policy {
  Roles: Array<{ Ref: string }>;
  PolicyDocument: { Statement: Statement[] };
}

function templateFor(stage: StageName) {
  const stack = app.node.findChild(`Spoh-${stage}-Platform`);
  if (!(stack instanceof PlatformStack)) throw new Error('Expected platform stack');
  return Template.fromStack(stack);
}

const staging = templateFor('staging');
const prod = templateFor('prod');
function taskFor(template: Template, name: string) {
  const tasks = Object.values(template.findResources('AWS::ECS::TaskDefinition')).map(
    (row) => row.Properties as Task,
  );
  const task = tasks.find((row) =>
    row.ContainerDefinitions.some((container) => container.Name === name),
  );
  if (!task) throw new Error(`Missing ${name} task`);
  return task;
}

function ssmStatements(template: Template, task: Task) {
  return Object.values(template.findResources('AWS::IAM::Policy'))
    .map((row) => row.Properties as Policy)
    .filter((policy) =>
      policy.Roles.some((role) => JSON.stringify(task.ExecutionRoleArn).includes(role.Ref)),
    )
    .flatMap((policy) => policy.PolicyDocument.Statement)
    .filter((statement) => [statement.Action].flat().some((action) => action.startsWith('ssm:')));
}

describe('infrastructure injection (P08.6)', () => {
  it('synthesises actual app and migration tasks with all nag checks passing', () => {
    expect(() => app.synth()).not.toThrow();
  });

  it.each(['staging', 'prod'] as const)(
    'defines the stage-specific infrastructure names in the %s namespace',
    (stage) => {
      const template = templateFor(stage);
      const parameters = Object.values(template.findResources('AWS::SSM::Parameter'));
      expect(parameters.map((row) => row.Properties.Name).sort()).toEqual(
        (stage === 'staging' ? STAGING_INFRA_NAMES : INFRA_NAMES).map(
          (name) => `/spoh/${stage}/infra/${name}`,
        ),
      );
      for (const row of parameters) {
        expect(row.Properties).toMatchObject({ Type: 'String', Tier: 'Standard' });
        expect(row.DeletionPolicy).toBe(stage === 'prod' ? 'Retain' : 'Delete');
      }
    },
  );

  it('wires the verified staging origins together while retaining Cognito and proxy settings', () => {
    const values = Object.fromEntries(
      Object.values(staging.findResources('AWS::SSM::Parameter')).map((row) => [
        row.Properties.Name.split('/').at(-1),
        row.Properties.Value,
      ]),
    );
    expect(values).toMatchObject({
      NODE_ENV: 'production',
      PORT: '4000',
      LOG_LEVEL: 'info',
      DB_NAME: 'spoh',
      AUTH_PROVIDER: 'cognito',
      COGNITO_REGION: 'ap-southeast-1',
      AWS_REGION: 'ap-southeast-1',
      TRUST_PROXY_HOPS: '1',
      APP_BASE_URL: 'https://api.secure-channel.duckdns.org',
      CLIENT_BASE_URL: 'https://secure-channel.duckdns.org',
      CORS_ALLOWED_ORIGINS: 'https://secure-channel.duckdns.org',
      DEPLOYMENT_ENV: 'staging',
    });
    const poolId = Object.keys(staging.findResources('AWS::Cognito::UserPool'))[0];
    expect(values.COGNITO_USER_POOL_ID).toEqual({ Ref: poolId });
    prod.resourceCountIs('AWS::Cognito::UserPool', 0);
  });

  it('sets only staging API callback and client logout URLs without replacing its pool or client', () => {
    staging.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      CallbackURLs: ['https://api.secure-channel.duckdns.org/api/v1/auth/callback'],
      LogoutURLs: ['https://secure-channel.duckdns.org/sign-in'],
      GenerateSecret: false,
      AllowedOAuthFlows: ['code'],
    });
    expect(Object.keys(staging.findResources('AWS::Cognito::UserPoolClient'))).toEqual([
      'IdentityClient148304DC',
    ]);
    prod.resourceCountIs('AWS::Cognito::UserPoolClient', 0);
    const values = Object.fromEntries(
      Object.values(prod.findResources('AWS::SSM::Parameter')).map((row) => [
        row.Properties.Name.split('/').at(-1),
        row.Properties.Value,
      ]),
    );
    const apiId = Object.keys(prod.findResources('AWS::ApiGatewayV2::Api'))[0];
    expect(values.APP_BASE_URL).toEqual({ 'Fn::GetAtt': [apiId, 'ApiEndpoint'] });
    expect(values.CORS_ALLOWED_ORIGINS).toEqual(values.APP_BASE_URL);
    expect(values.CLIENT_BASE_URL).toBeUndefined();
    expect(values.DEPLOYMENT_ENV).toBeUndefined();
    expect(values.COGNITO_USER_POOL_ID).toBe('ap-southeast-1_9bwl2nGF7');
  });

  it.each(['app', 'migrate'])(
    'injects the %s task at startup, keeping credentials in Secrets Manager',
    (name) => {
      const container = taskFor(staging, name).ContainerDefinitions[0]!;
      expect(container.Environment ?? []).toEqual([]);
      const infra = name === 'app' ? STAGING_INFRA_NAMES : ['DB_HOST', 'DB_NAME'];
      const credentials =
        name === 'app'
          ? ['DB_APP_PASSWORD', 'SESSION_SIGNING_SECRET']
          : ['DB_ADMIN_USER', 'DB_ADMIN_PASSWORD', 'DB_MIGRATOR_PASSWORD', 'DB_APP_PASSWORD'];
      expect(container.Secrets.map((secret) => secret.Name).sort()).toEqual(
        [...infra, ...credentials].sort(),
      );
      const parameters = staging.findResources('AWS::SSM::Parameter');
      for (const secret of container.Secrets) {
        const arn = JSON.stringify(secret.ValueFrom);
        if (infra.includes(secret.Name)) {
          const entry = Object.entries(parameters).find(([, row]) =>
            row.Properties.Name.endsWith(`/${secret.Name}`),
          );
          expect(entry).toBeDefined();
          expect(arn).toContain(':ssm:');
          expect(arn).toContain(entry![0]);
        } else {
          const secretIds = [
            ...Object.keys(staging.findResources('AWS::SecretsManager::Secret')),
            ...Object.keys(staging.findResources('AWS::SecretsManager::SecretTargetAttachment')),
          ];
          expect(typeof secret.ValueFrom).toBe('object');
          expect(secretIds.some((id) => arn.includes(id))).toBe(true);
        }
      }
      if (name === 'app') expect(container.PortMappings?.[0]?.ContainerPort).toBe(4000);
    },
  );

  it.each(['app', 'migrate'])(
    'grants only the %s execution role read access to its exact injected parameters',
    (name) => {
      const task = taskFor(staging, name);
      const statements = ssmStatements(staging, task);
      expect(statements.length).toBeGreaterThan(0);
      const resources = new Set(
        statements
          .flatMap((statement) => [statement.Resource].flat())
          .map((resource) => JSON.stringify(resource)),
      );
      const injected = task.ContainerDefinitions[0]!.Secrets.filter((secret) =>
        JSON.stringify(secret.ValueFrom).includes(':ssm:'),
      );
      expect([...resources].sort()).toEqual(
        injected.map((secret) => JSON.stringify(secret.ValueFrom)).sort(),
      );
      for (const statement of statements) {
        expect(
          [statement.Action]
            .flat()
            .every((action) =>
              /^ssm:(GetParameter|GetParameters|GetParameterHistory|DescribeParameters)$/.test(
                action,
              ),
            ),
        ).toBe(true);
      }
      for (const policy of Object.values(staging.findResources('AWS::IAM::Policy'))) {
        const document = policy.Properties as Policy;
        if (document.Roles.some((role) => JSON.stringify(task.TaskRoleArn).includes(role.Ref))) {
          expect(JSON.stringify(document.PolicyDocument)).not.toContain('ssm:');
        }
      }
    },
  );
});
