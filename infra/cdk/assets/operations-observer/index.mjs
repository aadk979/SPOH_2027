// Node 24 Lambda includes AWS SDK v3. Only control-plane metadata leaves this function.
const newestBackup = (points) =>
  Math.max(
    0,
    ...points
      .filter((point) => point.Status === 'COMPLETED')
      .map((point) => new Date(point.CreationDate).getTime()),
  );

export const observation = ({ service, recoveryPoints, now }) => {
  if (
    !service ||
    !Number.isInteger(service.desiredCount) ||
    !Number.isInteger(service.runningCount)
  )
    throw new Error('Service metadata is unavailable');
  const newest = newestBackup(recoveryPoints);
  return [
    {
      MetricName: 'RunningTaskDeficit',
      Unit: 'Count',
      Value: Math.max(0, service.desiredCount - service.runningCount),
    },
    {
      MetricName: 'BackupAgeSeconds',
      Unit: 'Seconds',
      Value: newest ? Math.max(0, (now - newest) / 1000) : 27 * 3600,
    },
  ];
};

export const collect = async ({ describeService, listBackups, publish, now }) => {
  const service = await describeService();
  const recoveryPoints = [];
  let nextToken;
  do {
    const page = await listBackups(nextToken);
    recoveryPoints.push(...(page.RecoveryPoints ?? []));
    nextToken = page.NextToken;
  } while (nextToken);
  await publish(observation({ service, recoveryPoints, now }));
};

export const handler = async () => {
  const { ECSClient, DescribeServicesCommand } = await import('@aws-sdk/client-ecs');
  const { BackupClient, ListRecoveryPointsByResourceCommand } =
    await import('@aws-sdk/client-backup');
  const { CloudWatchClient, PutMetricDataCommand } = await import('@aws-sdk/client-cloudwatch');
  const ecs = new ECSClient({});
  const backup = new BackupClient({});
  const cloudwatch = new CloudWatchClient({});
  await collect({
    now: Date.now(),
    describeService: async () => {
      const result = await ecs.send(
        new DescribeServicesCommand({
          cluster: process.env.CLUSTER,
          services: [process.env.SERVICE],
        }),
      );
      if (result.failures?.length) throw new Error('Service lookup failed');
      return result.services?.[0];
    },
    listBackups: (NextToken) =>
      backup.send(
        new ListRecoveryPointsByResourceCommand({
          ResourceArn: process.env.DATABASE_ARN,
          NextToken,
        }),
      ),
    publish: (MetricData) =>
      cloudwatch.send(
        new PutMetricDataCommand({ Namespace: process.env.METRIC_NAMESPACE, MetricData }),
      ),
  });
};
