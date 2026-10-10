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

/**
 * The policy engine's own failures (P11.5, D-22): every five minutes with any activity the
 * app logs how many questions the policies answered and how many failed to evaluate. A
 * failure in shadow is a log line; enforced, it is a 503. The allowed count shows the
 * policies ran at all, so a quiet alarm means something; the denied count shows a grant
 * gone wrong as a rise in refusals.
 */
export class AuthorizationMonitoring extends Construct {
  readonly failedAlarm: Alarm;

  constructor(scope: Construct, id: string, input: { stage: StageName; logGroup: ILogGroup }) {
    super(scope, id);
    const namespace = `SPOH/${input.stage}`;
    // Shadow (release 1) and enforcement (release 2) log the same counts under their names.
    const summary = FilterPattern.any(
      FilterPattern.stringValue('$.msg', '=', 'authorization shadow summary'),
      FilterPattern.stringValue('$.msg', '=', 'authorization summary'),
    );
    for (const [name, field] of [
      ['AuthorizationFailed', 'failed'],
      ['AuthorizationAllowed', 'allowed'],
      ['AuthorizationDenied', 'denied'],
    ] as const) {
      new MetricFilter(this, `${name}Filter`, {
        logGroup: input.logGroup,
        metricNamespace: namespace,
        metricName: name,
        filterPattern: FilterPattern.all(
          summary,
          FilterPattern.numberValue(`$.authorization.${field}`, '>=', 0),
        ),
        metricValue: `$.authorization.${field}`,
        unit: Unit.COUNT,
      });
    }
    this.failedAlarm = new Alarm(this, 'FailedAlarm', {
      alarmName: `spoh-${input.stage}-authorization-failed`,
      alarmDescription:
        'The policies failed to evaluate a request. Enforced, that request was refused.',
      metric: new Metric({
        namespace,
        metricName: 'AuthorizationFailed',
        unit: Unit.COUNT,
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      // A summary is logged only when the policies were asked something.
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    new CfnOutput(Stack.of(this), 'AuthorizationFailedAlarmName', {
      value: this.failedAlarm.alarmName,
    });
    this.avpAlarms(input, namespace);
  }

  /**
   * AVP itself (P11.9): the app logs an `avp summary` every five minutes with calls, failures,
   * throttles and p95 latency, and a line each time a decision degrades to the local engine.
   * Any failure, throttle or degraded decision alarms, and so does a p95 near the 200 ms timeout.
   */
  private avpAlarms(input: { stage: StageName; logGroup: ILogGroup }, namespace: string): void {
    const summary = FilterPattern.stringValue('$.msg', '=', 'avp summary');
    const metrics = [
      [
        'AvpFailed',
        '$.avp.failed',
        Unit.COUNT,
        'Sum',
        0,
        'AVP failed to answer (5xx, timeout or network).',
      ],
      ['AvpThrottled', '$.avp.throttled', Unit.COUNT, 'Sum', 0, 'AVP throttled the app.'],
      [
        'AvpLatencyP95',
        '$.avp.p95Ms',
        Unit.MILLISECONDS,
        'Maximum',
        150,
        'AVP p95 latency is near the 200 ms timeout.',
      ],
    ] as const;
    for (const [name, field, unit, statistic, threshold, description] of metrics) {
      new MetricFilter(this, `${name}Filter`, {
        logGroup: input.logGroup,
        metricNamespace: namespace,
        metricName: name,
        filterPattern: FilterPattern.all(summary, FilterPattern.numberValue(field, '>=', 0)),
        metricValue: field,
        unit,
      });
      this.alarm(input.stage, { namespace, name, unit, statistic, threshold, description });
    }
    new MetricFilter(this, 'AuthorizationDegradedFilter', {
      logGroup: input.logGroup,
      metricNamespace: namespace,
      metricName: 'AuthorizationDegraded',
      filterPattern: FilterPattern.stringValue(
        '$.msg',
        '=',
        'authorization degraded to the local engine',
      ),
      metricValue: '1',
      unit: Unit.COUNT,
    });
    this.alarm(input.stage, {
      namespace,
      name: 'AuthorizationDegraded',
      unit: Unit.COUNT,
      statistic: 'Sum',
      threshold: 0,
      description: 'Decisions ran on the local engine because AVP could not answer.',
    });
  }

  private alarm(
    stage: StageName,
    input: {
      namespace: string;
      name: string;
      unit: Unit;
      statistic: string;
      threshold: number;
      description: string;
    },
  ): Alarm {
    const slug = input.name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    return new Alarm(this, `${input.name}Alarm`, {
      alarmName: `spoh-${stage}-${slug}`,
      alarmDescription: input.description,
      metric: new Metric({
        namespace: input.namespace,
        metricName: input.name,
        unit: input.unit,
        statistic: input.statistic,
        period: Duration.minutes(5),
      }),
      threshold: input.threshold,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
  }
}
