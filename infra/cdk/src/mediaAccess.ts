import { Stack, Validations, type CfnResource } from 'aws-cdk-lib';
import type { FargateTaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { Bucket } from 'aws-cdk-lib/aws-s3';

/** Signing grants only existing photo operations; listing, deletion and ACLs are excluded. */
export function grantPhotoObjects(task: FargateTaskDefinition, bucket: Bucket): void {
  task.taskRole.addToPrincipalPolicy(
    new PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject'],
      resources: [bucket.arnForObjects('lost-found/*')],
    }),
  );
  const bucketId = Stack.of(bucket).getLogicalId(bucket.node.defaultChild as CfnResource);
  Validations.of(task.taskRole).acknowledge({
    id: `AwsSolutions-IAM5[Resource::<${bucketId}.Arn>/lost-found/*]`,
    reason:
      'Photo keys are generated UUIDs beneath lost-found/. The sole object wildcard is restricted to that prefix in the exact owned media bucket; only GetObject and PutObject are allowed. Tests refuse listing, deletion, ACLs and all other buckets.',
  });
}
