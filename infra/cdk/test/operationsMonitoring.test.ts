import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { PlatformStack } from '../src/platformStack.js';

const app = buildApp(new App({ context: { imageTag: 'release', serviceImageTag: 'release',
  '@aws-cdk/core:enablePartitionLiterals': true } }));
const templateFor = (stage: string) =>
  Template.fromStack(app.node.findChild(`Spoh-${stage}-Platform`) as PlatformStack);

describe('complete operational monitoring', () => {
  // SNS resource policies accept this service-defined list, not the IAM sns:* wildcard.
  // https://docs.aws.amazon.com/sns/latest/dg/sns-access-policy-language-api-permissions-reference.html
  it.each(['staging', 'prod'])('rejects insecure %s topic access using valid SNS policy actions', (stage) => {
    const template = templateFor(stage);
    const policies = Object.values(template.findResources('AWS::SNS::TopicPolicy'));
    expect(policies).toHaveLength(1);
    const deny = policies[0]!.Properties.PolicyDocument.Statement.find((statement: { Effect: string }) => statement.Effect === 'Deny');
    expect(deny).toMatchObject({ Principal: { AWS: '*' }, Condition: { Bool: { 'aws:SecureTransport': 'false' } } });
    expect([...deny.Action].sort()).toEqual([
      'sns:AddPermission', 'sns:DeleteTopic', 'sns:GetDataProtectionPolicy', 'sns:GetTopicAttributes',
      'sns:ListSubscriptionsByTopic', 'sns:ListTagsForResource', 'sns:Publish', 'sns:PutDataProtectionPolicy',
      'sns:RemovePermission', 'sns:SetTopicAttributes', 'sns:Subscribe',
    ]);
    const topic = Object.keys(template.findResources('AWS::SNS::Topic'))[0]!;
    expect(deny.Resource).toEqual({ Ref: topic });
  });
  it.each(['staging', 'prod'])('allows only the actual %s alarm ARN namespace to publish', (stage) => {
    const template = templateFor(stage);
    const policy = Object.values(template.findResources('AWS::SNS::TopicPolicy'))[0]!;
    const allows = policy.Properties.PolicyDocument.Statement.filter((statement: { Effect: string }) => statement.Effect === 'Allow');
    expect(allows).toEqual([{
      Sid: expect.any(String), Effect: 'Allow', Principal: { Service: 'cloudwatch.amazonaws.com' }, Action: 'sns:Publish',
      Resource: { Ref: Object.keys(template.findResources('AWS::SNS::Topic'))[0]! },
      Condition: { StringEquals: { 'aws:SourceAccount': '665146708212' },
        ArnLike: { 'aws:SourceArn': `arn:aws:cloudwatch:ap-southeast-1:665146708212:alarm:spoh-${stage}-*` } },
    }]);
  });
  it('synthesises the real resource catalogue with nag validation', () =>
    expect(() => app.synth()).not.toThrow());
  it.each(['staging', 'prod'])(
    'defines the remaining %s resource signals and owner delivery',
    (stage) => {
      const template = templateFor(stage);
      const alarms = Object.values(template.findResources('AWS::CloudWatch::Alarm'));
      const names = alarms.map((alarm) => alarm.Properties.AlarmName);
      for (const suffix of [
        'http-5xx-rate',
        'http-p95-latency',
        'running-tasks',
        'task-failure',
        'rds-cpu',
        'rds-free-storage',
        'rds-connections',
        'backup-age',
        'scheduler-lag',
        'scheduler-dead',
        'authorization-degraded',
        'cache-bus-degraded',
        'authorization-denial-volume', 'authorization-denial-ratio', 'permission-policy-change',
      ])
        expect(names).toContain(`spoh-${stage}-${suffix}`);
      const topicId = Object.keys(template.findResources('AWS::SNS::Topic'))[0]!;
      for (const alarm of alarms) {
        expect(alarm.Properties.AlarmActions).toEqual([{ Ref: topicId }]);
        expect(alarm.Properties.OKActions).toEqual([{ Ref: topicId }]);
      }
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: `spoh-${stage}-backup-age`,
        Threshold: 26 * 3600,
        TreatMissingData: 'breaching',
      });
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: `spoh-${stage}-rds-free-storage`,
        Threshold: 2 * 1024 ** 3,
        ComparisonOperator: 'LessThanThreshold',
      });
      template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
      const policyFilter = Object.values(template.findResources('AWS::Logs::MetricFilter')).find(
        (filter) => filter.Properties.MetricTransformations[0].MetricName === 'PermissionPolicyChanges')!;
      expect(policyFilter.Properties.FilterPattern).toBe('{ $.action = "permissions.change" }');
      const auditGroup = template.toJSON().Resources[policyFilter.Properties.LogGroupName.Ref];
      expect(auditGroup.Properties.LogGroupName).toBe(`/spoh/${stage}/audit`);
      expect(auditGroup.Properties.RetentionInDays).toBe(400);
      const templateJson = template.toJSON();
      expect(templateJson.Parameters.AlarmEmail.NoEcho).toBe(true);
      expect(templateJson.Parameters.EventWeekPhone.Default).toBe('');
      for (const subscription of Object.values(template.findResources('AWS::SNS::Subscription')))
        expect(subscription.Condition).toBeDefined();
      const observer = Object.values(template.findResources('AWS::Lambda::Function'))[0]!;
      expect(observer.Properties).toMatchObject({
        Runtime: 'nodejs24.x',
        Handler: 'index.handler',
        Timeout: 30,
      });
      const observerRole = JSON.stringify(observer.Properties.Role);
      const policies = Object.values(template.findResources('AWS::IAM::Policy')).filter((policy) =>
        policy.Properties.Roles.some((role: unknown) =>
          observerRole.includes(JSON.stringify(role).replace('{"Ref":', '').replace('}', '')),
        ),
      );
      expect(JSON.stringify(policies)).not.toMatch(/rds:(Modify|Delete)|ecs:Update|s3:/);
      expect(JSON.stringify(template.findResources('AWS::Events::Rule'))).toContain(
        'rate(1 minute)',
      );
    },
  );
  it('leaves the retained owner budget untouched unless management is explicitly enabled', () => {
    const defaultAccess = Template.fromStack(app.node.findChild('Spoh-DeployAccess') as never);
    defaultAccess.resourceCountIs('AWS::Budgets::Budget', 0);
    const managed = buildApp(new App({ context: { manageAccountBudget: true } }));
    const budget = Template.fromStack(managed.node.findChild('Spoh-DeployAccess') as never);
    budget.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: {
        BudgetLimit: { Amount: 100, Unit: 'USD' },
        TimeUnit: 'MONTHLY',
        BudgetType: 'COST',
      },
      NotificationsWithSubscribers: [80, 100].map((threshold) => ({
        Notification: { Threshold: threshold, ThresholdType: 'PERCENTAGE' },
      })),
    });
    expect(budget.toJSON().Parameters.BudgetEmail.NoEcho).toBe(true);
  });
});
