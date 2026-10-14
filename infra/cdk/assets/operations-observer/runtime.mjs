import { collect } from './index.mjs';
import { databaseSelection, nativeBackupPage } from './nativeBackup.mjs';

export async function handler() {
  const { ECSClient, DescribeServicesCommand } = await import('@aws-sdk/client-ecs');
  const { RDSClient, DescribeDBSnapshotsCommand } = await import('@aws-sdk/client-rds');
  const { CloudWatchClient, PutMetricDataCommand } = await import('@aws-sdk/client-cloudwatch');
  const selection = databaseSelection(process.env.DATABASE_ARN, process.env.DATABASE_IDENTIFIER);
  const configuration = { region: selection.region, maxAttempts: 1 };
  const ecs = new ECSClient(configuration);
  const rds = new RDSClient(configuration);
  const cloudwatch = new CloudWatchClient(configuration);
  const deadline = AbortSignal.timeout(20_000);
  try {
    await collect({
      describeService: async () => {
        const result = await ecs.send(new DescribeServicesCommand({
          cluster: process.env.CLUSTER, services: [process.env.SERVICE_ARN],
        }), { abortSignal: deadline });
        if (result.failures?.length || result.services?.length !== 1 ||
            result.services[0].serviceArn !== process.env.SERVICE_ARN ||
            result.services[0].clusterArn !== process.env.CLUSTER) {
          throw new Error('Selected service metadata is unavailable');
        }
        return result.services[0];
      },
      listBackups: async Marker => nativeBackupPage(await rds.send(new DescribeDBSnapshotsCommand({
        DBInstanceIdentifier: selection.identifier, SnapshotType: 'automated', MaxRecords: 100, Marker,
      }), { abortSignal: deadline }), selection),
      publish: MetricData => cloudwatch.send(new PutMetricDataCommand({
        Namespace: process.env.METRIC_NAMESPACE, MetricData,
      }), { abortSignal: AbortSignal.timeout(5_000) }),
    });
  } finally {
    ecs.destroy(); rds.destroy(); cloudwatch.destroy();
  }
}
