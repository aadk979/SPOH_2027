import { Stack, Validations, type CfnResource } from 'aws-cdk-lib';
import type { FargateTaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { Bucket } from 'aws-cdk-lib/aws-s3';

/** Freeze exact uploaded versions into immutable publications; drafts never get public access. */
export function grantContentObjects(task: FargateTaskDefinition, bucket: Bucket): void {
  const bucketId = Stack.of(bucket).getLogicalId(bucket.node.defaultChild as CfnResource);
  for (const prefix of ['drafts', 'content']) {
    task.taskRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['s3:GetObject', 's3:GetObjectVersion', 's3:PutObject'],
        resources: [bucket.arnForObjects(`${prefix}/*`)],
      }),
    );
    Validations.of(task.taskRole).acknowledge({
      id: `AwsSolutions-IAM5[Resource::<${bucketId}.Arn>/${prefix}/*]`,
      reason:
        'Server-generated event and publication UUID paths in the exact private content bucket. GetObjectVersion pins immutable copies; no bucket listing, deletion or ACLs are granted.',
    });
  }
}
