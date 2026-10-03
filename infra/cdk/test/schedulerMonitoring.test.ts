import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { PlatformStack } from '../src/platformStack.js';
import type { StageName } from '../src/config.js';

const app = buildApp(
  new App({ context: { imageTag: 'verified-release', serviceImageTag: 'verified-release' } }),
);
const templateFor = (stage: StageName) => {
  const stack = app.node.findChild(`Spoh-${stage}-Platform`);
  if (!(stack instanceof PlatformStack)) throw new Error('Expected platform stack');
  return Template.fromStack(stack);
};

describe('scheduler gauge alarms (P08.8/P10.6)', () => {
  it('synthesises actual service monitoring with all nag checks passing', () => {
    expect(() => app.synth()).not.toThrow();
  });

  it.each(['staging', 'prod'] as const)(
    'uses exactly two fixed-cardinality gauges in %s',
    (stage) => {
      const template = templateFor(stage);
      const filters = Object.values(template.findResources('AWS::Logs::MetricFilter')).filter(
        (row) => row.Properties.MetricTransformations[0].MetricName.startsWith('Scheduler'),
      );
      expect(filters).toHaveLength(2);
      for (const [field, name, unit] of [
        ['schedulerLagSeconds', 'SchedulerLagSeconds', 'Seconds'],
        ['schedulerDeadActions', 'SchedulerDeadActions', 'Count'],
      ]) {
        const filter = filters.find(
          (row) => row.Properties.MetricTransformations[0].MetricName === name,
        );
        expect(filter).toBeDefined();
        expect(filter!.Properties.FilterPattern).toBe(
          `{ ($.metric = "scheduler") && ($.${field} >= 0) }`,
        );
        expect(filter!.Properties.MetricTransformations).toEqual([
          {
            MetricNamespace: `SPOH/${stage}`,
            MetricName: name,
            MetricValue: `$.${field}`,
            Unit: unit,
          },
        ]);
        const logRef = filter!.Properties.LogGroupName.Ref;
        expect(template.toJSON().Resources[logRef].Properties.LogGroupName).toBe(
          `/spoh/${stage}/app`,
        );
      }
    },
  );

  it.each(['staging', 'prod'] as const)(
    'uses maximum observations without filling silent workers with zero in %s',
    (stage) => {
      const template = templateFor(stage);
      for (const [suffix, name, threshold, periods, unit] of [
        ['lag', 'SchedulerLagSeconds', 60, 2, 'Seconds'],
        ['dead', 'SchedulerDeadActions', 0, 1, 'Count'],
      ]) {
        template.hasResourceProperties('AWS::CloudWatch::Alarm', {
          AlarmName: `spoh-${stage}-scheduler-${suffix}`,
          Namespace: `SPOH/${stage}`,
          MetricName: name,
          Statistic: 'Maximum',
          Unit: unit,
          Period: 60,
          Threshold: threshold,
          ComparisonOperator: 'GreaterThanThreshold',
          EvaluationPeriods: periods,
          DatapointsToAlarm: periods,
          TreatMissingData: 'ignore',
        });
      }
      const schedulerAlarms = Object.values(
        template.findResources('AWS::CloudWatch::Alarm'),
      ).filter((alarm) => alarm.Properties.AlarmName.startsWith(`spoh-${stage}-scheduler-`));
      expect(schedulerAlarms).toHaveLength(2);
      for (const alarm of schedulerAlarms) {
        expect(alarm.Properties.Dimensions).toBeUndefined();
        expect(alarm.Properties.AlarmActions).toBeUndefined();
      }
    },
  );
});
