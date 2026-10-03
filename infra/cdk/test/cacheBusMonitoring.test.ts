import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { PlatformStack } from '../src/platformStack.js';

const app = buildApp(
  new App({ context: { imageTag: 'verified-release', serviceImageTag: 'verified-release' } }),
);

describe('cache bus degradation monitoring (P08.8)', () => {
  it('synthesises staging/prod with all nag checks passing', () => {
    expect(() => app.synth()).not.toThrow();
  });

  it.each(['staging', 'prod'] as const)(
    'isolates %s observations without masking a degraded peer or silent workers',
    (stage) => {
      const stack = app.node.findChild(`Spoh-${stage}-Platform`);
      if (!(stack instanceof PlatformStack)) throw new Error('Expected platform stack');
      const template = Template.fromStack(stack);
      const filters = Object.values(template.findResources('AWS::Logs::MetricFilter')).filter(
        (row) => row.Properties.MetricTransformations[0].MetricName === 'CacheBusDegraded',
      );
      expect(filters).toHaveLength(1);
      expect(filters[0]!.Properties).toMatchObject({
        FilterPattern:
          '{ ($.metric = "cache-bus") && (($.cacheBusDegraded = 0) || ($.cacheBusDegraded = 1)) }',
        MetricTransformations: [
          {
            MetricNamespace: `SPOH/${stage}`,
            MetricName: 'CacheBusDegraded',
            MetricValue: '$.cacheBusDegraded',
            Unit: 'Count',
          },
        ],
      });
      expect(filters[0]!.Properties.MetricTransformations[0].DefaultValue).toBeUndefined();
      expect(filters[0]!.Properties.MetricTransformations[0].Dimensions).toBeUndefined();
      const logId = filters[0]!.Properties.LogGroupName.Ref;
      expect(template.toJSON().Resources[logId].Properties.LogGroupName).toBe(`/spoh/${stage}/app`);
      const alarms = Object.entries(template.findResources('AWS::CloudWatch::Alarm')).filter(
        ([, row]) => row.Properties.AlarmName === `spoh-${stage}-cache-bus-degraded`,
      );
      expect(alarms).toHaveLength(1);
      expect(alarms[0]![1].Properties).toMatchObject({
        Namespace: `SPOH/${stage}`,
        MetricName: 'CacheBusDegraded',
        Unit: 'Count',
        Statistic: 'Maximum',
        Period: 60,
        Threshold: 0,
        EvaluationPeriods: 3,
        DatapointsToAlarm: 2,
        ComparisonOperator: 'GreaterThanThreshold',
        TreatMissingData: 'missing',
      });
      for (const field of ['Dimensions', 'AlarmActions', 'OKActions', 'InsufficientDataActions']) {
        expect(alarms[0]![1].Properties[field]).toBeUndefined();
      }
      expect(template.toJSON().Outputs.CacheBusDegradedAlarmName.Value).toEqual({
        Ref: alarms[0]![0],
      });
    },
  );
});
