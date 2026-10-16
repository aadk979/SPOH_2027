import { Stack, Validations, type CfnResource } from 'aws-cdk-lib';
import type { FargateTaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { Bucket } from 'aws-cdk-lib/aws-s3';

/** Freeze exact versions and clean durable orphan intents; drafts never get public access. */
export function grantContentObjects(task: FargateTaskDefinition, bucket: Bucket): void {
  const bucketId = Stack.of(bucket).getLogicalId(bucket.node.defaultChild as CfnResource);
  task.taskRole.addToPrincipalPolicy(
    new PolicyStatement({
      actions: ['s3:ListBucket'],
      resources: [bucket.bucketArn],
      conditions: { StringLike: { 's3:prefix': ['drafts/*', 'content/*'] } },
    }),
  );
  for (const prefix of ['drafts', 'content']) {
    task.taskRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: [
          's3:GetObject',
          's3:GetObjectVersion',
          's3:PutObject',
          's3:DeleteObject',
          's3:DeleteObjectVersion',
        ],
        resources: [bucket.arnForObjects(`${prefix}/*`)],
      }),
    );
    Validations.of(task.taskRole).acknowledge({
      id: `AwsSolutions-IAM5[Resource::<${bucketId}.Arn>/${prefix}/*]`,
      reason:
        'Server-generated event and publication UUID paths in the exact private content bucket. Version reads pin immutable copies; exact-key/version deletion cleans unbound durable storage intents. Only prefix-constrained content/draft existence checks are permitted; bucket-root/version listing and ACLs are not granted.',
    });
  }
}
