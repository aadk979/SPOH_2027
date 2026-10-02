import { CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import type { IHttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import {
  Alarm,
  ComparisonOperator,
  MathExpression,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import type { StageName } from './config.js';

/** Native API-wide metrics avoid paid route dimensions and remain isolated by API id. */
export class HttpMonitoring extends Construct {
  readonly errorRateAlarm: Alarm;
  readonly latencyAlarm: Alarm;

  constructor(scope: Construct, id: string, input: { stage: StageName; api: IHttpApi }) {
    super(scope, id);
    const period = Duration.minutes(5);
    const errorRate = new MathExpression({
      expression: 'IF(requests > 0, 100 * errors / requests, 0)',
      usingMetrics: {
        errors: input.api.metricServerError({ statistic: 'Sum', period }),
        requests: input.api.metricCount({ statistic: 'Sum', period }),
      },
      period,
      label: 'HTTP 5xx rate (%)',
    });
    this.errorRateAlarm = new Alarm(this, 'ErrorRateAlarm', {
      alarmName: `spoh-${input.stage}-http-5xx-rate`,
      alarmDescription: 'Over 1% of HTTP API requests returned server errors in five minutes.',
      metric: errorRate,
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    this.latencyAlarm = new Alarm(this, 'LatencyAlarm', {
      alarmName: `spoh-${input.stage}-http-p95-latency`,
      alarmDescription: 'HTTP API p95 latency exceeded the 300 ms target in two of three minutes.',
      metric: input.api.metricLatency({ statistic: 'p95', period: Duration.minutes(1) }),
      threshold: 300,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluateLowSampleCountPercentile: 'evaluate',
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    // Request metrics cannot detect silence; availability and SNS owner delivery stay open.
    new CfnOutput(Stack.of(this), 'HttpErrorRateAlarmName', {
      value: this.errorRateAlarm.alarmName,
    });
    new CfnOutput(Stack.of(this), 'HttpLatencyAlarmName', { value: this.latencyAlarm.alarmName });
  }
}
