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

/** Fixed-cardinality gauges from every worker, separated by environment rather than instance. */
export class SchedulerMonitoring extends Construct {
  readonly lagAlarm: Alarm;
  readonly deadAlarm: Alarm;

  constructor(scope: Construct, id: string, input: { stage: StageName; logGroup: ILogGroup }) {
    super(scope, id);
    this.lagAlarm = this.gaugeAlarm('Lag', input, {
      field: 'schedulerLagSeconds',
      metricName: 'SchedulerLagSeconds',
      unit: Unit.SECONDS,
      threshold: 60,
      evaluationPeriods: 2,
      description: 'Eligible scheduled work is over one minute late for two consecutive minutes.',
    });
    this.deadAlarm = this.gaugeAlarm('Dead', input, {
      field: 'schedulerDeadActions',
      metricName: 'SchedulerDeadActions',
      unit: Unit.COUNT,
      threshold: 0,
      evaluationPeriods: 1,
      description:
        'A registered scheduled action exhausted its retry budget and needs investigation.',
    });
    new CfnOutput(Stack.of(this), 'SchedulerLagAlarmName', { value: this.lagAlarm.alarmName });
    new CfnOutput(Stack.of(this), 'SchedulerDeadAlarmName', { value: this.deadAlarm.alarmName });
  }

  private gaugeAlarm(
    id: string,
    input: { stage: StageName; logGroup: ILogGroup },
    gauge: {
      field: string;
      metricName: string;
      unit: Unit;
      threshold: number;
      evaluationPeriods: number;
      description: string;
    },
  ): Alarm {
    const namespace = `SPOH/${input.stage}`;
    new MetricFilter(this, `${id}Filter`, {
      logGroup: input.logGroup,
      metricNamespace: namespace,
      metricName: gauge.metricName,
      filterPattern: FilterPattern.all(
        FilterPattern.stringValue('$.metric', '=', 'scheduler'),
        FilterPattern.numberValue(`$.${gauge.field}`, '>=', 0),
      ),
      metricValue: `$.${gauge.field}`,
      unit: gauge.unit,
      // A missing worker observation is not a healthy zero. Availability alarms remain P08.8.
    });
    return new Alarm(this, `${id}Alarm`, {
      alarmName: `spoh-${input.stage}-scheduler-${id.toLowerCase()}`,
      alarmDescription: gauge.description,
      metric: new Metric({
        namespace,
        metricName: gauge.metricName,
        unit: gauge.unit,
        statistic: 'Maximum',
        period: Duration.minutes(1),
      }),
      threshold: gauge.threshold,
      evaluationPeriods: gauge.evaluationPeriods,
      datapointsToAlarm: gauge.evaluationPeriods,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.IGNORE,
      // SNS actions and owner delivery verification are a separate P08.8 slice.
    });
  }
}
