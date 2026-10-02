import { CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import { Alarm, ComparisonOperator, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import type { IDatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';
import type { StageName } from './config.js';

/** Native instance CPU detection; storage/connection limits and owner delivery are separate slices. */
export class DatabaseCpuMonitoring extends Construct {
  readonly cpuAlarm: Alarm;

  constructor(
    scope: Construct,
    id: string,
    input: { stage: StageName; database: IDatabaseInstance },
  ) {
    super(scope, id);
    this.cpuAlarm = new Alarm(this, 'CpuAlarm', {
      alarmName: `spoh-${input.stage}-rds-cpu`,
      alarmDescription: 'RDS average CPU exceeded 90% in five consecutive one-minute periods.',
      metric: input.database.metricCPUUtilization({
        statistic: 'Average',
        period: Duration.minutes(1),
      }),
      threshold: 90,
      evaluationPeriods: 5,
      datapointsToAlarm: 5,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      // A parked database has no observations; silence does not establish healthy CPU.
      treatMissingData: TreatMissingData.MISSING,
    });
    new CfnOutput(Stack.of(this), 'DatabaseCpuAlarmName', { value: this.cpuAlarm.alarmName });
  }
}
