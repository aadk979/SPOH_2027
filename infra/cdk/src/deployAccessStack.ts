import { CfnOutput, Duration, Stack, Validations, type StackProps } from 'aws-cdk-lib';
import {
  OpenIdConnectProvider,
  PolicyStatement,
  Role,
  WebIdentityPrincipal,
} from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export interface DeployAccessStackProps extends StackProps {
  /** The only repository allowed to deploy, as the OIDC `sub` claim writes it (`owner@id/name@id`). */
  repository: string;
  /** The CDK bootstrap qualifier (`cdk bootstrap` default). */
  qualifier?: string;
}

const GITHUB_OIDC = 'token.actions.githubusercontent.com';

/**
 * How CI reaches the account (P08.2): GitHub's OIDC provider and one role that
 * a workflow in this repository may assume, from `main` or a deployment
 * environment, with no static keys. The role can only assume the CDK
 * bootstrap roles, so what it may change is what CloudFormation deploys.
 */
export class DeployAccessStack extends Stack {
  readonly role: Role;

  constructor(scope: Construct, id: string, props: DeployAccessStackProps) {
    super(scope, id, props);
    const qualifier = props.qualifier ?? 'hnb659fds';

    const provider = new OpenIdConnectProvider(this, 'GitHubOidc', {
      url: `https://${GITHUB_OIDC}`,
      clientIds: ['sts.amazonaws.com'],
    });

    this.role = new Role(this, 'GitHubDeployRole', {
      roleName: 'spoh-github-deploy',
      description: `GitHub Actions in ${props.repository}: cdk diff and deploy through the bootstrap roles`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: { [`${GITHUB_OIDC}:aud`]: 'sts.amazonaws.com' },
        StringLike: {
          [`${GITHUB_OIDC}:sub`]: [
            `repo:${props.repository}:ref:refs/heads/main`,
            `repo:${props.repository}:environment:staging`,
            `repo:${props.repository}:environment:prod`,
          ],
        },
      }),
    });

    this.role.addToPolicy(
      new PolicyStatement({
        actions: ['sts:AssumeRole', 'sts:TagSession'],
        resources: [
          `arn:aws:iam::${this.account}:role/cdk-${qualifier}-*-${this.account}-${this.region}`,
        ],
      }),
    );

    Validations.of(this.role).acknowledge({
      id: `AwsSolutions-IAM5[Resource::arn:aws:iam::${this.account}:role/cdk-${qualifier}-*-${this.account}-${this.region}]`,
      reason:
        'The wildcard is the four CDK bootstrap roles (deploy, lookup, file and image publishing) of this account and region; nothing else can be assumed.',
    });

    new CfnOutput(this, 'DeployRoleArn', { value: this.role.roleArn });
  }
}
