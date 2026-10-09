import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { PlatformStack } from '../src/platformStack.js';

const app = buildApp(
  new App({ context: { imageTag: 'verified-release', serviceImageTag: 'verified-release' } }),
);

describe('authorization evaluation monitoring (P11.5, D-22)', () => {
  it.each(['staging', 'prod'] as const)(
    'counts %s failed and allowed evaluations from the shadow summary, and alarms on any failure',
    (stage) => {
      const stack = app.node.findChild(`Spoh-${stage}-Platform`);
      if (!(stack instanceof PlatformStack)) throw new Error('Expected platform stack');
      const template = Template.fromStack(stack);
      for (const [name, field] of [
        ['AuthorizationFailed', 'failed'],
        ['AuthorizationAllowed', 'allowed'],
      ]) {
        const filters = Object.values(template.findResources('AWS::Logs::MetricFilter')).filter(
          (row) => row.Properties.MetricTransformations[0].MetricName === name,
        );
        expect(filters).toHaveLength(1);
        expect(filters[0]!.Properties).toMatchObject({
          FilterPattern: `{ ($.msg = "authorization shadow summary") && ($.authorization.${field} >= 0) }`,
          MetricTransformations: [
            {
              MetricNamespace: `SPOH/${stage}`,
              MetricName: name,
              MetricValue: `$.authorization.${field}`,
              Unit: 'Count',
            },
          ],
        });
        const logId = filters[0]!.Properties.LogGroupName.Ref;
        expect(template.toJSON().Resources[logId].Properties.LogGroupName).toBe(
          `/spoh/${stage}/app`,
        );
      }
      const alarms = Object.entries(template.findResources('AWS::CloudWatch::Alarm')).filter(
        ([, row]) => row.Properties.AlarmName === `spoh-${stage}-authorization-failed`,
      );
      expect(alarms).toHaveLength(1);
      expect(alarms[0]![1].Properties).toMatchObject({
        Namespace: `SPOH/${stage}`,
        MetricName: 'AuthorizationFailed',
        Statistic: 'Sum',
        Period: 300,
        Threshold: 0,
        EvaluationPeriods: 1,
        ComparisonOperator: 'GreaterThanThreshold',
        TreatMissingData: 'notBreaching',
      });
      expect(template.toJSON().Outputs.AuthorizationFailedAlarmName.Value).toEqual({
        Ref: alarms[0]![0],
      });
    },
  );
});
