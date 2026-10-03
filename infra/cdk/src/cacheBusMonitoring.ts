import { CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import {
  Alarm,
  ComparisonOperator,
  Metric,
  TreatMissingData,
  Unit,
} from 'aws-cdk-lib/aws-cloudwatch';
import { FilterPattern, type ILogGroup, MetricFilter } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import type { StageName } from './config.js';

/** Any reporting instance in bypass mode is degraded; a healthy peer cannot mask it. */
export class CacheBusMonitoring extends Construct {
  readonly degradedAlarm: Alarm;

  constructor(scope: Construct, id: string, input: { stage: StageName; logGroup: ILogGroup }) {
    super(scope, id);
    const namespace = `SPOH/${input.stage}`;
    const metricName = 'CacheBusDegraded';
    new MetricFilter(this, 'DegradedFilter', {
      logGroup: input.logGroup,
      metricNamespace: namespace,
      metricName,
      filterPattern: FilterPattern.all(
        FilterPattern.stringValue('$.metric', '=', 'cache-bus'),
        FilterPattern.any(
          FilterPattern.numberValue('$.cacheBusDegraded', '=', 0),
          FilterPattern.numberValue('$.cacheBusDegraded', '=', 1),
        ),
      ),
      metricValue: '$.cacheBusDegraded',
      unit: Unit.COUNT,
    });
    this.degradedAlarm = new Alarm(this, 'DegradedAlarm', {
      alarmName: `spoh-${input.stage}-cache-bus-degraded`,
      alarmDescription: 'An instance reported cache bus bypass mode in two of three minutes.',
      metric: new Metric({
        namespace,
        metricName,
        unit: Unit.COUNT,
        statistic: 'Maximum',
        period: Duration.minutes(1),
      }),
      threshold: 0,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      // Silent or parked workers do not establish a healthy connection.
      treatMissingData: TreatMissingData.MISSING,
    });
    new CfnOutput(Stack.of(this), 'CacheBusDegradedAlarmName', {
      value: this.degradedAlarm.alarmName,
    });
  }
}
