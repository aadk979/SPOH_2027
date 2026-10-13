import { CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import { PolicyStatement, Role, WebIdentityPrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import type { AuthorizationStore } from './authorizationStore.js';
import { REPOSITORY } from './config.js';

/** Synthetic, dispatch-only staging decisions; no deployment role or production store. */
export class StagingPermissionMatrixAccess extends Construct {
  constructor(scope: Construct, id: string, input: { providerArn: string; authorization: AuthorizationStore }) {
    super(scope, id);
    const role = new Role(this, 'Role', {
      roleName: 'spoh-staging-permission-matrix',
      description: 'Read and evaluate only the synthetic staging permission matrix from immutable main repository identity.',
      maxSessionDuration: Duration.hours(1),
      assumedBy: new WebIdentityPrincipal(input.providerArn, { StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub': `repo:${REPOSITORY}:ref:refs/heads/main`,
      } }),
    });
    role.addToPolicy(new PolicyStatement({ actions: ['verifiedpermissions:ListPolicies',
      'verifiedpermissions:GetPolicy', 'verifiedpermissions:GetSchema', 'verifiedpermissions:IsAuthorized'],
      resources: [input.authorization.policyStoreArn] }));
    new CfnOutput(Stack.of(this), 'PermissionMatrixRoleArn', { value: role.roleArn });
  }
}
