import { Stack, Validations, type CfnResource } from 'aws-cdk-lib';
import type { FargateTaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { Bucket } from 'aws-cdk-lib/aws-s3';

/** Photo uploads, reads and scheduled privacy deletion; no listing or ACLs. */
export function grantPhotoObjects(task: FargateTaskDefinition, bucket: Bucket): void {
  task.taskRole.addToPrincipalPolicy(
    new PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
      resources: [bucket.arnForObjects('lost-found/*')],
    }),
  );
  const bucketId = Stack.of(bucket).getLogicalId(bucket.node.defaultChild as CfnResource);
  Validations.of(task.taskRole).acknowledge({
    id: `AwsSolutions-IAM5[Resource::<${bucketId}.Arn>/lost-found/*]`,
    reason:
      'Photo keys are generated UUIDs beneath lost-found/. Access is restricted to that prefix in the owned media bucket; DeleteObject is required for event-close privacy retention. No bucket listing, version listing or ACLs are allowed.',
  });
}
