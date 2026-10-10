import {
  CfnCondition,
  CfnOutput,
  CfnParameter,
  Duration,
  Fn,
  RemovalPolicy,
  Stack,
  Validations,
} from 'aws-cdk-lib';
import { CfnBudget } from 'aws-cdk-lib/aws-budgets';
import {
  Alarm,
  type CfnAlarm,
  ComparisonOperator,
  Dashboard,
  GraphWidget,
  Metric,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { AnyPrincipal, Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { IDatabaseInstance } from 'aws-cdk-lib/aws-rds';
import type { FargateService } from 'aws-cdk-lib/aws-ecs';
import { CfnSubscription, Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';
import type { StageName } from './config.js';

/** Missing native metrics and operational delivery, kept independent from application roles. */
export class OperationsMonitoring extends Construct {
  constructor(
    scope: Construct,
    id: string,
    input: { stage: StageName; database: IDatabaseInstance; service?: FargateService },
  ) {
    super(scope, id);
    new LogGroup(this, 'AuditLogs', {
      logGroupName: `/spoh/${input.stage}/audit`,
      retention: RetentionDays.THIRTEEN_MONTHS,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.databaseAlarms(input);
    if (input.service) this.observations(input, input.service);
    this.delivery(input.stage);
  }

  private databaseAlarms(input: { stage: StageName; database: IDatabaseInstance }): void {
    const period = Duration.minutes(1);
    for (const [id, metric, threshold, operator] of [
      [
        'free-storage',
        input.database.metricFreeStorageSpace({ statistic: 'Minimum', period }),
        2 * 1024 ** 3,
        ComparisonOperator.LESS_THAN_THRESHOLD,
      ],
      // Leave headroom under the micro's configured connection ceiling; load testing ratifies it.
      [
        'connections',
        input.database.metricDatabaseConnections({ statistic: 'Maximum', period }),
        80,
        ComparisonOperator.GREATER_THAN_THRESHOLD,
      ],
    ] as const)
      new Alarm(this, id, {
        alarmName: `spoh-${input.stage}-rds-${id}`,
        metric,
        threshold,
        evaluationPeriods: 3,
        datapointsToAlarm: 2,
        comparisonOperator: operator,
        treatMissingData: TreatMissingData.MISSING,
      });
  }

  private observations(
    input: { stage: StageName; database: IDatabaseInstance },
    service: FargateService,
  ): void {
    const logs = new LogGroup(this, 'ObserverLogs', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const role = new Role(this, 'ObserverRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });
    logs.grantWrite(role);
    const observer = new Function(this, 'Observer', {
      runtime: Runtime.NODEJS_24_X,
      handler: 'index.handler',
      timeout: Duration.seconds(30),
      memorySize: 128,
      logGroup: logs,
      role,
      code: Code.fromAsset(
        fileURLToPath(new URL('../assets/operations-observer', import.meta.url)),
      ),
      environment: {
        CLUSTER: service.cluster.clusterArn,
        SERVICE: service.serviceName,
        DATABASE_ARN: input.database.instanceArn,
        METRIC_NAMESPACE: `SPOH/${input.stage}`,
      },
    });
    observer.addToRolePolicy(
      new PolicyStatement({ actions: ['ecs:DescribeServices'], resources: [service.serviceArn] }),
    );
    observer.addToRolePolicy(
      new PolicyStatement({ actions: ['backup:ListRecoveryPointsByResource'], resources: ['*'] }),
    );
    observer.addToRolePolicy(
      new PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: { StringEquals: { 'cloudwatch:namespace': `SPOH/${input.stage}` } },
      }),
    );
    Validations.of(role).acknowledge({
      id: 'AwsSolutions-IAM5[Resource::*]',
      reason:
        'Backup ListRecoveryPointsByResource does not support resource-level IAM; its request uses only this database ARN. PutMetricData requires * and is constrained to this stage namespace. The observer cannot mutate resources.',
    });
    new Rule(this, 'Observe', {
      schedule: Schedule.rate(Duration.minutes(1)),
      targets: [new LambdaFunction(observer, { retryAttempts: 2 })],
    });
    for (const [id, name, threshold, missing] of [
      ['running-tasks', 'RunningTaskDeficit', 0, TreatMissingData.BREACHING],
      ['backup-age', 'BackupAgeSeconds', 26 * 3600, TreatMissingData.BREACHING],
    ] as const)
      new Alarm(this, id, {
        alarmName: `spoh-${input.stage}-${id}`,
        metric: new Metric({
          namespace: `SPOH/${input.stage}`,
          metricName: name,
          statistic: 'Maximum',
          period: Duration.minutes(1),
        }),
        threshold,
        evaluationPeriods: 3,
        datapointsToAlarm: 2,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: missing,
      });
    new Alarm(this, 'ObserverFailure', {
      alarmName: `spoh-${input.stage}-monitoring-failed`,
      metric: observer.metricErrors({ period: Duration.minutes(1), statistic: 'Sum' }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
  }

  private delivery(stage: StageName): void {
    const stack = Stack.of(this);
    const topic = new Topic(this, 'Alerts', { topicName: `spoh-${stage}-alerts` });
    Validations.of(topic).acknowledge({
      id: 'AwsSolutions-SNS2',
      reason:
        'Alerts contain only resource names and metrics, never personal data or credentials. Avoid a paid customer KMS key and unsupported AWS-managed-key service publishing; SNS transports notifications over TLS.',
    });
    Validations.of(topic).acknowledge({
      id: 'AwsSolutions-SNS3',
      reason:
        'CloudWatch publishes through its native service integration; email and SMS subscriptions cannot use HTTPS endpoint policies. The topic policy below refuses insecure API transport.',
    });
    topic.addToResourcePolicy(
      new PolicyStatement({
        actions: ['sns:*'],
        resources: [topic.topicArn],
        effect: Effect.DENY,
        principals: [new AnyPrincipal()],
        conditions: { Bool: { 'aws:SecureTransport': 'false' } },
      }),
    );
    topic.addToResourcePolicy(
      new PolicyStatement({
        actions: ['sns:Publish'],
        resources: [topic.topicArn],
        principals: [new ServicePrincipal('cloudwatch.amazonaws.com')],
        conditions: {
          StringEquals: { 'aws:SourceAccount': stack.account },
          ArnLike: {
            'aws:SourceArn': stack.formatArn({
              service: 'cloudwatch',
              resource: 'alarm',
              resourceName: `spoh-${stage}-*`,
            }),
          },
        },
      }),
    );
    for (const [id, protocol, pattern] of [
      ['AlarmEmail', 'email', '^$|^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'],
      ['EventWeekPhone', 'sms', '^$|^\\+[1-9][0-9]{7,14}$'],
    ] as const) {
      const endpoint = new CfnParameter(stack, id, {
        type: 'String',
        default: '',
        noEcho: true,
        allowedPattern: pattern,
        description:
          protocol === 'sms'
            ? 'Optional approved on-call number, event weeks only (SMS incurs charges).'
            : 'Owner alarm email; confirm the SNS subscription before P16 acceptance.',
      });
      const enabled = new CfnCondition(this, `${id}Configured`, {
        expression: Fn.conditionNot(Fn.conditionEquals(endpoint.valueAsString, '')),
      });
      const subscription = new CfnSubscription(this, id, {
        topicArn: topic.topicArn,
        protocol,
        endpoint: endpoint.valueAsString,
      });
      subscription.cfnOptions.condition = enabled;
    }
    const alarms = stack.node.findAll().filter((node): node is Alarm => node instanceof Alarm);
    for (const alarm of alarms) {
      const resource = alarm.node.defaultChild as CfnAlarm;
      resource.addPropertyOverride('AlarmActions', [topic.topicArn]);
      resource.addPropertyOverride('OKActions', [topic.topicArn]);
    }
    new Dashboard(this, 'Dashboard', {
      dashboardName: `spoh-${stage}`,
      widgets: alarms.map((alarm) => [
        new GraphWidget({ title: alarm.alarmName, left: [alarm.metric] }),
      ]),
    });
    new CfnOutput(stack, 'AlarmTopicArn', { value: topic.topicArn });
  }
}

/** The single account budget is optional because teardown retained the owner's existing budget. */
export function accountBudget(scope: Construct): void {
  const stack = Stack.of(scope);
  if (!stack.node.tryGetContext('manageAccountBudget')) return;
  const email = new CfnParameter(stack, 'BudgetEmail', {
    type: 'String',
    noEcho: true,
    allowedPattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
    description: 'Owner email, supplied privately at deployment.',
  });
  new CfnBudget(scope, 'AccountBudget', {
    budget: {
      budgetName: 'spoh-platform-monthly',
      budgetType: 'COST',
      timeUnit: 'MONTHLY',
      budgetLimit: { amount: 100, unit: 'USD' },
    },
    notificationsWithSubscribers: [80, 100].map((threshold) => ({
      notification: {
        comparisonOperator: 'GREATER_THAN',
        notificationType: 'ACTUAL',
        thresholdType: 'PERCENTAGE',
        threshold,
      },
      subscribers: [{ address: email.valueAsString, subscriptionType: 'EMAIL' }],
    })),
  });
}
