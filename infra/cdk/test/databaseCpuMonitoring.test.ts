import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { PlatformStack } from '../src/platformStack.js';

const app = buildApp(
  new App({
    context: {
      imageTag: 'verified-release',
      serviceImageTag: 'verified-release',
    },
  }),
);

describe('native database CPU monitoring (P08.8)', () => {
  it('synthesises actual staging/prod stacks with all nag checks passing', () => {
    expect(() => app.synth()).not.toThrow();
  });

  it.each(['staging', 'prod'] as const)(
    'binds the %s alarm to its actual database and preserves database configuration',
    (stage) => {
      const stack = app.node.findChild(`Spoh-${stage}-Platform`);
      if (!(stack instanceof PlatformStack)) throw new Error('Expected platform stack');
      const template = Template.fromStack(stack);
      const databases = template.findResources('AWS::RDS::DBInstance');
      expect(Object.keys(databases)).toHaveLength(1);
      const databaseId = Object.keys(databases)[0]!;
      const alarms = template.findResources('AWS::CloudWatch::Alarm');
      const cpu = Object.entries(alarms).filter(
        ([, alarm]) => alarm.Properties.AlarmName === `spoh-${stage}-rds-cpu`,
      );
      expect(cpu).toHaveLength(1);
      expect(cpu[0]![1].Properties).toMatchObject({
        Namespace: 'AWS/RDS',
        MetricName: 'CPUUtilization',
        Dimensions: [{ Name: 'DBInstanceIdentifier', Value: { Ref: databaseId } }],
        Statistic: 'Average',
        Period: 60,
        Threshold: 90,
        ComparisonOperator: 'GreaterThanThreshold',
        EvaluationPeriods: 5,
        DatapointsToAlarm: 5,
        TreatMissingData: 'missing',
      });
      const properties = cpu[0]![1].Properties;
      expect(properties.AlarmActions).toBeUndefined();
      expect(properties.OKActions).toBeUndefined();
      expect(properties.InsufficientDataActions).toBeUndefined();
      expect(properties.Metrics).toBeUndefined();
      expect(databases[databaseId]!.Properties).toMatchObject({
        AllocatedStorage: '20',
        MaxAllocatedStorage: 100,
        DBInstanceClass: 'db.t4g.micro',
        StorageEncrypted: true,
        PubliclyAccessible: false,
        DeletionProtection: true,
      });
      const { Outputs } = template.toJSON();
      expect(Outputs.DatabaseCpuAlarmName.Value).toEqual({ Ref: cpu[0]![0] });
    },
  );
});
