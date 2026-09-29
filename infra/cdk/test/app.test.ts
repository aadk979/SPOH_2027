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

  it('keeps the production Cognito pool referenced, never owned', () => {
    expect(STAGES.prod.existingUserPoolId).toBe('ap-southeast-1_9bwl2nGF7');
    expect(STAGES.staging.existingUserPoolId).toBeUndefined();
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
                  'repo:aadk979/SPOH_2027:ref:refs/heads/main',
                  'repo:aadk979/SPOH_2027:environment:staging',
                  'repo:aadk979/SPOH_2027:environment:prod',
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
    expect(actions.filter((action) => !action.startsWith('sts:'))).toEqual([]);
  });
});
