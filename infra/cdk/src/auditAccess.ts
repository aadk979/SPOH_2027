import { ArnFormat, Stack, Token, Validations } from 'aws-cdk-lib';
import type { FargateTaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { StageName } from './config.js';

/** The retained audit copy (P08.8): OperationsMonitoring creates it, the app appends to it. */
export function auditLogGroupName(stage: StageName): string {
  return `/spoh/${stage}/audit`;
}

/**
 * Append only: the app may create its stream and put events, never read, change retention,
 * delete events or the group. The database trail and this copy then fail independently.
 */
export function grantAuditShipping(task: FargateTaskDefinition, stage: StageName): void {
  const stack = Stack.of(task);
  task.taskRole.addToPrincipalPolicy(
    new PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [
        stack.formatArn({
          service: 'logs',
          resource: 'log-group',
          resourceName: `${auditLogGroupName(stage)}:log-stream:*`,
          arnFormat: ArnFormat.COLON_RESOURCE_NAME,
        }),
      ],
    }),
  );
  // cdk-nag names the finding by the rendered ARN: concrete for an environment-bound stack.
  const region = Token.isUnresolved(stack.region) ? '<AWS::Region>' : stack.region;
  const account = Token.isUnresolved(stack.account) ? '<AWS::AccountId>' : stack.account;
  const partition = Token.isUnresolved(stack.partition) ? '<AWS::Partition>' : stack.partition;
  Validations.of(task.taskRole).acknowledge({
    id: `AwsSolutions-IAM5[Resource::arn:${partition}:logs:${region}:${account}:log-group:${auditLogGroupName(stage)}:log-stream:*]`,
    reason:
      'Streams of the one retained audit log group; the server creates a single fixed stream and can only append to it.',
  });
}
