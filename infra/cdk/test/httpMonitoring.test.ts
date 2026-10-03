import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MetricFilter } from 'aws-cdk-lib/aws-logs';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { PlatformStack } from '../src/platformStack.js';
import type { StageName } from '../src/config.js';

const app = buildApp(
  new App({ context: { imageTag: 'verified-release', serviceImageTag: 'verified-release' } }),
);
function templateFor(stage: StageName) {
  const stack = app.node.findChild(`Spoh-${stage}-Platform`);
  if (!(stack instanceof PlatformStack)) throw new Error('Expected platform stack');
  return Template.fromStack(stack);
}

describe('native HTTP API monitoring (P08.8)', () => {
  it('synthesises both actual platform stages with all nag checks passing', () => {
    expect(() => app.synth()).not.toThrow();
  });

  it.each(['staging', 'prod'] as const)(
    'uses the actual %s API id for five-minute error rate math',
    (stage) => {
      const template = templateFor(stage);
      const apiId = Object.keys(template.findResources('AWS::ApiGatewayV2::Api'))[0]!;
      const alarms = Object.values(template.findResources('AWS::CloudWatch::Alarm'));
      const rate = alarms.find(
        (alarm) => alarm.Properties.AlarmName === `spoh-${stage}-http-5xx-rate`,
      )!.Properties;
      expect(rate).toMatchObject({
        Threshold: 1,
        ComparisonOperator: 'GreaterThanThreshold',
        EvaluationPeriods: 1,
        DatapointsToAlarm: 1,
        TreatMissingData: 'notBreaching',
      });
      const expression = rate.Metrics.find((metric: { Expression?: string }) => metric.Expression);
      expect(expression).toMatchObject({
        Expression: 'IF(requests > 0, 100 * errors / requests, 0)',
        ReturnData: true,
      });
      expect(expression.Expression).not.toContain('FILL');
      for (const [id, metricName] of [
        ['errors', '5xx'],
        ['requests', 'Count'],
      ]) {
        const metric = rate.Metrics.find((row: { Id: string }) => row.Id === id);
        expect(metric).toEqual({
          Id: id,
          ReturnData: false,
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ApiGateway',
              MetricName: metricName,
              Dimensions: [{ Name: 'ApiId', Value: { Ref: apiId } }],
            },
            Period: 300,
            Stat: 'Sum',
          },
        });
      }
    },
  );

  it.each(['staging', 'prod'] as const)(
    'uses native %s p95 milliseconds without extra metric filters',
    (stage) => {
      const template = templateFor(stage);
      const apiId = Object.keys(template.findResources('AWS::ApiGatewayV2::Api'))[0]!;
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: `spoh-${stage}-http-p95-latency`,
        Namespace: 'AWS/ApiGateway',
        MetricName: 'Latency',
        Dimensions: [{ Name: 'ApiId', Value: { Ref: apiId } }],
        ExtendedStatistic: 'p95',
        Period: 60,
        Threshold: 300,
        ComparisonOperator: 'GreaterThanThreshold',
        EvaluationPeriods: 3,
        DatapointsToAlarm: 2,
        EvaluateLowSampleCountPercentile: 'evaluate',
        TreatMissingData: 'notBreaching',
      });
      const httpAlarms = Object.values(template.findResources('AWS::CloudWatch::Alarm')).filter(
        (alarm) => alarm.Properties.AlarmName.startsWith(`spoh-${stage}-http-`),
      );
      expect(httpAlarms).toHaveLength(2);
      const monitoring = app.node
        .findChild(`Spoh-${stage}-Platform`)
        .node.findChild('HttpMonitoring');
      expect(monitoring.node.findAll().some((node) => node instanceof MetricFilter)).toBe(false);
      for (const stageResource of Object.values(
        template.findResources('AWS::ApiGatewayV2::Stage'),
      )) {
        expect(stageResource.Properties.DefaultRouteSettings?.DetailedMetricsEnabled).not.toBe(
          true,
        );
        for (const route of Object.values(stageResource.Properties.RouteSettings ?? {}) as Array<{
          DetailedMetricsEnabled?: boolean;
        }>)
          expect(route.DetailedMetricsEnabled).not.toBe(true);
      }
      for (const alarm of httpAlarms) {
        expect(alarm.Properties.AlarmActions).toBeUndefined();
        expect(alarm.Properties.OKActions).toBeUndefined();
        expect(alarm.Properties.InsufficientDataActions).toBeUndefined();
      }
      const { Outputs, Resources } = template.toJSON();
      for (const [output, name] of [
        ['HttpErrorRateAlarmName', `spoh-${stage}-http-5xx-rate`],
        ['HttpLatencyAlarmName', `spoh-${stage}-http-p95-latency`],
      ]) {
        expect(Outputs[output!].Value).toEqual({ Ref: expect.any(String) });
        expect(Resources[Outputs[output!].Value.Ref]).toMatchObject({
          Type: 'AWS::CloudWatch::Alarm',
          Properties: { AlarmName: name },
        });
      }
    },
  );
});
