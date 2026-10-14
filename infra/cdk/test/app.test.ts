import { App } from 'aws-cdk-lib';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { STAGES } from '../src/config.js';

describe('CDK app (P08.1)', () => {
  const app = buildApp(new App());
  const stacks = app.node.children.filter((child) => 'templateOptions' in child);

  it('defines one platform stack per stage, in the stage account and region', () => {
    expect(stacks.map((stack) => stack.node.id).sort()).toEqual([
      'Spoh-DeployAccess',
      'Spoh-prod-Platform',
      'Spoh-staging-Platform',
    ]);
  });

  it('synthesises with the AwsSolutions checks passing', () => {
    // The nag pack is a validation plugin: any unsuppressed finding throws here.
    expect(() => app.synth()).not.toThrow();
  });

  it('retains production identities and lets staging pools go with their stack', () => {
    expect(STAGES.prod.identity).toEqual({ plan: 'essentials', retain: true });
    expect(STAGES.staging.identity).toEqual({ plan: 'essentials', retain: false });
  });
});

describe('deploy access (P08.2)', () => {
  it('lets only this repository, from main or a deployment environment, assume the deploy role', async () => {
    const { Template } = await import('aws-cdk-lib/assertions');
    const app = buildApp(new App());
    const template = Template.fromStack(app.node.findChild('Spoh-DeployAccess') as never);
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'spoh-github-deploy',
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Condition: {
              StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
              StringLike: {
                'token.actions.githubusercontent.com:sub': [
                  'repo:aadk979@138833125/SPOH_2027@1379786785:ref:refs/heads/main',
                  'repo:aadk979@138833125/SPOH_2027@1379786785:environment:staging',
                  'repo:aadk979@138833125/SPOH_2027@1379786785:environment:prod',
                ],
              },
            },
          },
        ],
      },
    });
    const policies = template.findResources('AWS::IAM::Policy');
    const actions = Object.values(policies).flatMap((policy) =>
      (
        policy as { Properties: { PolicyDocument: { Statement: Array<{ Action: string[] }> } } }
      ).Properties.PolicyDocument.Statement.flatMap((statement) => statement.Action),
    );
    // Assume the CDK roles, push images, read stack outputs, run the migrate task and read the
    // AVP store for the drift check (P11.6): nothing else.
    const allowed =
      /^(sts:(AssumeRole|TagSession)|ecr:.+|ecs:(RunTask|DescribeTasks|UpdateService|DescribeServices)|rds:(StartDBInstance|StopDBInstance|DescribeDBInstances)|iam:PassRole|cloudformation:DescribeStacks|verifiedpermissions:(ListPolicies|GetPolicy|GetSchema))$/;
    expect(actions.filter((action) => !allowed.test(action))).toEqual([]);
  });

  it('can observe drain counts only on the staging services it can park', async () => {
    const { Template } = await import('aws-cdk-lib/assertions');
    const app = buildApp(new App());
    const template = Template.fromStack(app.node.findChild('Spoh-DeployAccess') as never);
    const statements = Object.values(template.findResources('AWS::IAM::Policy')).flatMap(
      (policy) =>
        (
          policy as {
            Properties: {
              PolicyDocument: {
                Statement: Array<{ Action: string | string[]; Resource: string | string[] }>;
              };
            };
          }
        ).Properties.PolicyDocument.Statement,
    );
    const describe = statements.filter((row) =>
      [row.Action].flat().includes('ecs:DescribeServices'),
    );
    expect(describe).toHaveLength(1);
    expect([describe[0]!.Resource].flat()).toEqual([
      'arn:aws:ecs:ap-southeast-1:665146708212:service/Spoh-staging-Platform-AppCluster*/Spoh-staging-Platform-AppService*',
    ]);
    expect([describe[0]!.Action].flat().sort()).toEqual([
      'ecs:DescribeServices',
      'ecs:UpdateService',
    ]);
  });
});
