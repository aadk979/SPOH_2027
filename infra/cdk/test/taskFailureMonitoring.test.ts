import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
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

describe('app task failure monitoring (partial P08.8)', () => {
  it('synthesises both actual stage stacks with nag checks passing', () => {
    expect(() => app.synth()).not.toThrow();
  });

  it.each(['staging', 'prod'] as const)(
    'selects only actual %s service failures, excluding one-off tasks and intentional stops',
    (stage) => {
      const template = templateFor(stage);
      const clusterId = Object.keys(template.findResources('AWS::ECS::Cluster'))[0]!;
      const serviceId = Object.keys(template.findResources('AWS::ECS::Service'))[0]!;
      template.hasResourceProperties('AWS::Events::Rule', {
        State: 'ENABLED',
        EventPattern: Match.exact({
          source: ['aws.ecs'],
          'detail-type': ['ECS Task State Change'],
          account: ['665146708212'],
          region: ['ap-southeast-1'],
          detail: {
            clusterArn: [{ 'Fn::GetAtt': [clusterId, 'Arn'] }],
            group: [{ 'Fn::Join': ['', ['service:', { 'Fn::GetAtt': [serviceId, 'Name'] }]] }],
            lastStatus: ['STOPPED'],
            stopCode: ['EssentialContainerExited', 'TaskFailedToStart'],
          },
        }),
      });
    },
  );

  it.each(['staging', 'prod'] as const)(
    'retains only bounded %s failure metadata and scopes delivery to its log group',
    (stage) => {
      const template = templateFor(stage);
      const logs = Object.entries(template.findResources('AWS::Logs::LogGroup')).find(
        ([, row]) => row.Properties.LogGroupName === `/spoh/${stage}/task-failures`,
      )!;
      expect(logs[1]).toMatchObject({
        Properties: { RetentionInDays: 30 },
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
      });
      const rules = Object.values(template.findResources('AWS::Events::Rule'));
      expect(rules).toHaveLength(1);
      const target = rules[0]!.Properties.Targets[0];
      expect(target.Arn).toEqual({
        'Fn::Join': [
          '',
          [
            'arn:',
            { Ref: 'AWS::Partition' },
            ':logs:ap-southeast-1:665146708212:log-group:',
            { Ref: logs[0] },
          ],
        ],
      });
      expect(target.RoleArn).toBeUndefined();
      expect(target.Input).toBeUndefined();
      expect(target.InputPath).toBeUndefined();
      expect(target.InputTransformer.InputPathsMap).toEqual({
        time: '$.time',
        task: '$.detail.taskArn',
        code: '$.detail.stopCode',
      });
      const rendered = target.InputTransformer.InputTemplate.replaceAll(
        '<time>',
        '2026-10-06T00:00:00Z',
      )
        .replaceAll('<task>', 'arn:aws:ecs:ap-southeast-1:665146708212:task/example/123')
        .replaceAll('<code>', 'EssentialContainerExited');
      const envelope = JSON.parse(rendered);
      expect(Object.keys(envelope)).toEqual(['timestamp', 'message']);
      expect(JSON.parse(envelope.message)).toEqual({
        metric: 'task-failure',
        taskFailure: 1,
        taskArn: 'arn:aws:ecs:ap-southeast-1:665146708212:task/example/123',
        stopCode: 'EssentialContainerExited',
      });
      expect(template.findResources('AWS::Lambda::Function')).toEqual({});
      const policies = Object.values(template.findResources('AWS::Logs::ResourcePolicy'));
      expect(policies).toHaveLength(1);
      const logArn = `arn:aws:logs:ap-southeast-1:665146708212:log-group:/spoh/${stage}/task-failures:*`;
      const policyDocument = policies[0]!.Properties.PolicyDocument['Fn::Join'][1]
        .map((part: string | { Ref?: string; 'Fn::GetAtt'?: string[] }) => {
          if (typeof part === 'string') return part;
          if (part.Ref === 'AWS::Partition') return 'aws';
          expect(part).toEqual({ 'Fn::GetAtt': [logs[0], 'Arn'] });
          return logArn;
        })
        .join('');
      expect(JSON.parse(policyDocument)).toEqual({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: ['events.amazonaws.com', 'delivery.logs.amazonaws.com'] },
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
            Resource: logArn,
            Condition: {
              ArnEquals: {
                'aws:SourceArn': `arn:aws:events:ap-southeast-1:665146708212:rule/spoh-${stage}-task-failures`,
              },
              StringEquals: { 'aws:SourceAccount': '665146708212' },
            },
          },
        ],
      });
      expect(rules[0]!.DependsOn).toContain(
        Object.keys(template.findResources('AWS::Logs::ResourcePolicy'))[0],
      );
      expect(rules[0]!.DependsOn).toContain(
        Object.keys(template.findResources('AWS::Logs::MetricFilter')).find((id) =>
          id.includes('TaskFailureMonitoring'),
        ),
      );
    },
  );

  it.each(['staging', 'prod'] as const)(
    'alarms on a %s failure observation without claiming exact restarts or availability',
    (stage) => {
      const template = templateFor(stage);
      template.hasResourceProperties('AWS::Logs::MetricFilter', {
        FilterPattern: '{ ($.metric = "task-failure") && ($.taskFailure = 1) }',
        MetricTransformations: Match.exact([
          {
            MetricNamespace: `SPOH/${stage}`,
            MetricName: 'TaskFailureEvents',
            MetricValue: '1',
            Unit: 'Count',
          },
        ]),
      });
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: `spoh-${stage}-task-failure`,
        Namespace: `SPOH/${stage}`,
        MetricName: 'TaskFailureEvents',
        Statistic: 'Sum',
        Unit: 'Count',
        Period: 60,
        Threshold: 0,
        ComparisonOperator: 'GreaterThanThreshold',
        EvaluationPeriods: 1,
        DatapointsToAlarm: 1,
        TreatMissingData: 'notBreaching',
        Dimensions: Match.absent(),
        AlarmActions: Match.absent(),
        OKActions: Match.absent(),
        InsufficientDataActions: Match.absent(),
      });
      const alarm = Object.entries(template.findResources('AWS::CloudWatch::Alarm')).find(
        ([, row]) => row.Properties.AlarmName === `spoh-${stage}-task-failure`,
      )!;
      expect(template.toJSON().Outputs.TaskFailureAlarmName.Value).toEqual({ Ref: alarm[0] });
      const cluster = Object.values(template.findResources('AWS::ECS::Cluster'))[0]!;
      expect(cluster.Properties.ClusterSettings).toEqual([
        { Name: 'containerInsights', Value: 'disabled' },
      ]);
    },
  );

  it('defines no detector when the release has only a one-off migration task', () => {
    const migrationApp = buildApp(new App({ context: { imageTag: 'verified-release' } }));
    const stack = migrationApp.node.findChild('Spoh-staging-Platform');
    if (!(stack instanceof PlatformStack)) throw new Error('Expected platform stack');
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::Events::Rule', 0);
    template.resourceCountIs('AWS::Logs::ResourcePolicy', 0);
    expect(template.toJSON().Outputs.TaskFailureAlarmName).toBeUndefined();
  });
});
