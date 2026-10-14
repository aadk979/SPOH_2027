import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { CloudWatchClient, DescribeAlarmsCommand } from '@aws-sdk/client-cloudwatch';
import type { CloudReadinessConfig } from '../../../config/schemas/readiness.js';
import type { CloudReadinessReaders } from './ports.js';
import { restorableDatabase, selectedAlarms } from './nativeMetadata.js';
import { nativeSmoke } from './nativeSmoke.js';

/** Own-role credentials, selected resource requests and one bounded attempt per observation. */
export function cloudReadinessReaders(config: CloudReadinessConfig,
  input: { now: () => number; fetch: typeof fetch }): CloudReadinessReaders {
  const configuration = { region: config.region, maxAttempts: 1 };
  const rds = new RDSClient(configuration);
  const cloudwatch = new CloudWatchClient(configuration);
  return {
    smoke: signal => nativeSmoke(config, { ...input, signal }),
    backups: async signal => {
      const response = await rds.send(new DescribeDBInstancesCommand({
        DBInstanceIdentifier: config.databaseIdentifier,
      }), { abortSignal: signal });
      if (response.Marker) throw new Error('Selected database lookup is incomplete');
      return restorableDatabase(config, response.DBInstances, input.now());
    },
    alarms: async signal => {
      const response = await cloudwatch.send(new DescribeAlarmsCommand({
        AlarmNames: config.requiredAlarmIds.map(id => id.split(':alarm:')[1]!),
        AlarmTypes: ['MetricAlarm'], MaxRecords: 100,
      }), { abortSignal: signal });
      if (response.NextToken || response.CompositeAlarms?.length) throw new Error('Selected alarm lookup is incomplete');
      return selectedAlarms(config, response.MetricAlarms, input.now());
    },
  };
}
