import { readFileSync } from 'node:fs';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('dispatch-only staging permission matrix access', () => {
  it('trusts only immutable main repository identity and can read/evaluate only the exact staging store', () => {
    const app = buildApp(new App());
    const staging = Template.fromStack(app.node.findChild('Spoh-staging-Platform') as never);
    const roles = Object.entries(staging.findResources('AWS::IAM::Role'));
    const [roleId, role] = roles.find(([, row]) => row.Properties.RoleName === 'spoh-staging-permission-matrix')!;
    expect(role.Properties.AssumeRolePolicyDocument.Statement).toEqual([expect.objectContaining({
      Action: 'sts:AssumeRoleWithWebIdentity',
      Condition: { StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub': 'repo:aadk979@138833125/SPOH_2027@1379786785:ref:refs/heads/main',
      } },
    })]);
    const policyId = Object.keys(staging.findResources('AWS::VerifiedPermissions::PolicyStore'))[0];
    const policies = Object.values(staging.findResources('AWS::IAM::Policy')).filter((row) =>
      row.Properties.Roles.some((ref: { Ref: string }) => ref.Ref === roleId));
    expect(policies).toHaveLength(1);
    expect(policies[0]!.Properties.PolicyDocument.Statement).toEqual([{
      Effect: 'Allow', Resource: { 'Fn::GetAtt': [policyId, 'Arn'] }, Action: [
        'verifiedpermissions:ListPolicies', 'verifiedpermissions:GetPolicy',
        'verifiedpermissions:GetSchema', 'verifiedpermissions:IsAuthorized',
      ],
    }]);
    const production = Template.fromStack(app.node.findChild('Spoh-prod-Platform') as never);
    expect(Object.values(production.findResources('AWS::IAM::Role')).filter((row) =>
      row.Properties.RoleName === 'spoh-staging-permission-matrix')).toEqual([]);
  });

  it('keeps the matrix dispatch-only, exact-main and credentials after source/local-case validation', () => {
    const workflow = readFileSync(new URL('../../../.github/workflows/staging-permission-matrix.yml', import.meta.url), 'utf8');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s*(schedule|environment|pull_request|push):/m);
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('staging-permission-matrix.yml@refs/heads/main');
    expect(workflow.indexOf('Pin reviewed source before credentials')).toBeLessThan(workflow.indexOf('configure-aws-credentials'));
    expect(workflow.indexOf('Record the complete passing synthetic')).toBeLessThan(workflow.indexOf('configure-aws-credentials'));
    expect(workflow).not.toContain('spoh-github-deploy');
    expect(workflow).toContain('spoh-staging-permission-matrix');
  });
});
