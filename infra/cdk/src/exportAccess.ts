import { Stack, Validations, type CfnResource } from 'aws-cdk-lib';
import type { FargateTaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { Bucket } from 'aws-cdk-lib/aws-s3';

/** Only generated archive paths: no listing, deletion, ACL or direct public download. */
export function grantExportObjects(task: FargateTaskDefinition, bucket: Bucket) {
  task.taskRole.addToPrincipalPolicy(
    new PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject'],
      resources: [bucket.arnForObjects('archive/*'), bucket.arnForObjects('card-print/*')],
    }),
  );
  const bucketId = Stack.of(bucket).getLogicalId(bucket.node.defaultChild as CfnResource);
  Validations.of(task.taskRole).acknowledge({
    id: `AwsSolutions-IAM5[Resource::<${bucketId}.Arn>/archive/*]`,
    reason:
      'Server-generated event and UUID archive workbook paths in the exact private exports bucket; no listing, deletion or ACL access.',
  });
  Validations.of(task.taskRole).acknowledge({
    id: `AwsSolutions-IAM5[Resource::<${bucketId}.Arn>/card-print/*]`,
    reason: 'Server-generated event and UUID printable-card paths in the exact private exports bucket; no listing, deletion or ACL access.',
  });
}
