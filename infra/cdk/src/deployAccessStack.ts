import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  Validations,
  type StackProps,
} from 'aws-cdk-lib';
import { Repository, TagMutability } from 'aws-cdk-lib/aws-ecr';
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
/** The one image repository; every stage runs images from it, tagged by commit. */
export const IMAGE_REPOSITORY = 'spoh-app';

export class DeployAccessStack extends Stack {
  readonly role: Role;
  readonly repository: Repository;

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

    this.repository = new Repository(this, 'AppImages', {
      repositoryName: IMAGE_REPOSITORY,
      imageScanOnPush: true,
      imageTagMutability: TagMutability.IMMUTABLE,
      lifecycleRules: [{ description: 'Keep the last 15 images', maxImageCount: 15 }],
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.repository.grantPullPush(this.role);
    // Reading a stack's outputs: which image the service runs now.
    this.role.addToPolicy(
      new PolicyStatement({
        actions: ['cloudformation:DescribeStacks'],
        resources: [`arn:aws:cloudformation:${this.region}:${this.account}:stack/Spoh-*/*`],
      }),
    );
    // A release runs the migrate task before moving the service (P08.4).
    this.role.addToPolicy(
      new PolicyStatement({
        actions: ['ecs:RunTask'],
        resources: [`arn:aws:ecs:${this.region}:${this.account}:task-definition/spoh-*-migrate:*`],
      }),
    );
    this.role.addToPolicy(
      new PolicyStatement({
        actions: ['ecs:DescribeTasks'],
        resources: [`arn:aws:ecs:${this.region}:${this.account}:task/*`],
      }),
    );
    this.role.addToPolicy(
      new PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [`arn:aws:iam::${this.account}:role/Spoh-*-Platform-AppMigrateTask*`],
        conditions: { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } },
      }),
    );
    for (const [finding, reason] of [
      [
        `AwsSolutions-IAM5[Resource::arn:aws:ecs:${this.region}:${this.account}:task-definition/spoh-*-migrate:*]`,
        'Every revision of the migrate task families; no other task can be run.',
      ],
      [
        `AwsSolutions-IAM5[Resource::arn:aws:cloudformation:${this.region}:${this.account}:stack/Spoh-*/*]`,
        'Read-only outputs of the platform stacks.',
      ],
      [
        `AwsSolutions-IAM5[Resource::arn:aws:ecs:${this.region}:${this.account}:task/*]`,
        'DescribeTasks, to wait for the migrate task it started; read-only.',
      ],
      [
        `AwsSolutions-IAM5[Resource::arn:aws:iam::${this.account}:role/Spoh-*-Platform-AppMigrateTask*]`,
        'The migrate task roles CDK names per stage, passable to ECS tasks only.',
      ],
    ]) {
      Validations.of(this.role).acknowledge({ id: finding!, reason: reason! });
    }
    Validations.of(this.role).acknowledge({
      id: 'AwsSolutions-IAM5[Resource::*]',
      reason:
        'ecr:GetAuthorizationToken, which AWS only grants on "*"; pushes are scoped to the spoh-app repository.',
    });

    new CfnOutput(this, 'DeployRoleArn', { value: this.role.roleArn });
    new CfnOutput(this, 'ImageRepositoryUri', { value: this.repository.repositoryUri });
  }
}
