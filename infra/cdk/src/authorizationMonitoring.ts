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
  }
}
