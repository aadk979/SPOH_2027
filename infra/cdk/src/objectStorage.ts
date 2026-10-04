import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  HttpMethods,
  ObjectOwnership,
  type BucketProps,
  type CorsRule,
  type IBucket,
} from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import type { StageConfig } from './config.js';

const PRIVATE_BUCKET = {
  blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
  encryption: BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
  removalPolicy: RemovalPolicy.RETAIN,
  autoDeleteObjects: false,
} satisfies BucketProps;
const ABORT_INCOMPLETE = {
  id: 'abort-incomplete-multipart',
  abortIncompleteMultipartUploadAfter: Duration.days(1),
};

/** CORS never grants object access; it allows the exact client to use signed POSTs. */
function mediaCors(origin?: string): CorsRule[] {
  if (!origin) return [];
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.hostname.includes('*'))
    throw new Error('Media CORS requires one exact HTTPS client origin');
  return [
    {
      allowedOrigins: [origin],
      allowedMethods: [HttpMethods.POST],
      allowedHeaders: ['Content-Type'],
      maxAge: 300,
    },
  ];
}

/** Retained private storage; application access is wired in a separate release. */
export class ObjectStorage extends Construct {
  readonly media: Bucket;
  readonly content: Bucket;
  readonly exports: Bucket;
  readonly backups: IBucket;

  constructor(scope: Construct, id: string, stage: StageConfig) {
    super(scope, id);
    // Log delivery must use resource policies; ACLs remain disabled on every owned bucket.
    this.node.setContext('@aws-cdk/aws-s3:serverAccessLogsUseBucketPolicy', true);
    const logs = new Bucket(this, 'AccessLogs', {
      ...PRIVATE_BUCKET,
      lifecycleRules: [
        ABORT_INCOMPLETE,
        { id: 'expired-access-logs', expiration: Duration.days(30) },
      ],
    });
    this.media = new Bucket(this, 'Media', {
      ...PRIVATE_BUCKET,
      serverAccessLogsBucket: logs,
      serverAccessLogsPrefix: 'media/',
      cors: mediaCors(stage.publicOrigins?.client),
      // Media expiry is tied to Event.CLOSED, not to an object's upload age (ADR-003 §8).
      lifecycleRules: [ABORT_INCOMPLETE],
    });
    this.content = new Bucket(this, 'Content', {
      ...PRIVATE_BUCKET,
      versioned: true,
      serverAccessLogsBucket: logs,
      serverAccessLogsPrefix: 'content/',
      lifecycleRules: [ABORT_INCOMPLETE],
    });
    this.exports = new Bucket(this, 'Exports', {
      ...PRIVATE_BUCKET,
      serverAccessLogsBucket: logs,
      serverAccessLogsPrefix: 'exports/',
      lifecycleRules: [ABORT_INCOMPLETE, { id: 'expired-exports', expiration: Duration.days(90) }],
    });
    this.backups = Bucket.fromBucketName(this, 'ExistingBackups', stage.existingBackupsBucket);
    const stack = Stack.of(this);
    for (const [name, bucket] of Object.entries({
      Media: this.media,
      Content: this.content,
      Exports: this.exports,
      ExistingBackups: this.backups,
    }))
      new CfnOutput(stack, `${name}BucketName`, { value: bucket.bucketName });
  }
}
