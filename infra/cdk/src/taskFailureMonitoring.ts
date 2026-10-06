import { ArnFormat, CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  Alarm,
  ComparisonOperator,
  Metric,
  TreatMissingData,
  Unit,
} from 'aws-cdk-lib/aws-cloudwatch';
import type { FargateService } from 'aws-cdk-lib/aws-ecs';
import { CfnRule } from 'aws-cdk-lib/aws-events';
import {
  CfnResourcePolicy,
  FilterPattern,
  LogGroup,
  MetricFilter,
  RetentionDays,
} from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import type { StageName } from './config.js';

/** Failure events are a presence signal, not an exact restart count or service availability. */
export class TaskFailureMonitoring extends Construct {
  readonly failureAlarm: Alarm;

  constructor(scope: Construct, id: string, input: { stage: StageName; service: FargateService }) {
    super(scope, id);
    const logs = new LogGroup(this, 'FailureLogs', {
      logGroupName: `/spoh/${input.stage}/task-failures`,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.failureAlarm = this.failureGauge(logs, input.stage);
    this.failureEvents(logs, input.service, input.stage);
    new CfnOutput(Stack.of(this), 'TaskFailureAlarmName', { value: this.failureAlarm.alarmName });
  }

  private failureGauge(logs: LogGroup, stage: StageName): Alarm {
    const namespace = `SPOH/${stage}`;
    const metricName = 'TaskFailureEvents';
    new MetricFilter(this, 'FailureFilter', {
      logGroup: logs,
      metricNamespace: namespace,
      metricName,
      filterPattern: FilterPattern.all(
        FilterPattern.stringValue('$.metric', '=', 'task-failure'),
        FilterPattern.numberValue('$.taskFailure', '=', 1),
      ),
      metricValue: '1',
      unit: Unit.COUNT,
    });
    return new Alarm(this, 'FailureAlarm', {
      alarmName: `spoh-${stage}-task-failure`,
      alarmDescription: 'An app service task failed to start or its essential container exited.',
      metric: new Metric({
        namespace,
        metricName,
        statistic: 'Sum',
        unit: Unit.COUNT,
        period: Duration.minutes(1),
      }),
      threshold: 0,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      // Failure events are sparse; no event does not establish that the service is available.
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
  }

  private failureEvents(logs: LogGroup, service: FargateService, stage: StageName): void {
    const ruleName = `spoh-${stage}-task-failures`;
    const policy = this.eventDeliveryPolicy(logs, ruleName);
    // Native CloudFormation avoids the LogGroup target's Lambda custom resource and task grants.
    const rule = new CfnRule(this, 'FailureEvents', {
      name: ruleName,
      description: 'App service startup and essential-container failures only.',
      state: 'ENABLED',
      eventPattern: taskFailurePattern(service),
      targets: [failureLogTarget(logs)],
    });
    rule.addResourceDependency(policy);
    rule.node.addDependency(this.node.findChild('FailureFilter'), this.failureAlarm);
  }

  private eventDeliveryPolicy(logs: LogGroup, ruleName: string): CfnResourcePolicy {
    const stack = Stack.of(this);
    return new CfnResourcePolicy(this, 'EventDeliveryPolicy', {
      policyName: `spoh-${this.node.id}-${stack.stackName}`,
      policyDocument: stack.toJsonString({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: ['events.amazonaws.com', 'delivery.logs.amazonaws.com'] },
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
            Resource: logs.logGroupArn,
            Condition: {
              ArnEquals: {
                'aws:SourceArn': stack.formatArn({
                  service: 'events',
                  resource: 'rule',
                  arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
                  resourceName: ruleName,
                }),
              },
              StringEquals: { 'aws:SourceAccount': stack.account },
            },
          },
        ],
      }),
    });
  }
}

function taskFailurePattern(service: FargateService) {
  const stack = Stack.of(service);
  return {
    source: ['aws.ecs'],
    'detail-type': ['ECS Task State Change'],
    account: [stack.account],
    region: [stack.region],
    detail: {
      clusterArn: [service.cluster.clusterArn],
      group: [`service:${service.serviceName}`],
      lastStatus: ['STOPPED'],
      stopCode: ['EssentialContainerExited', 'TaskFailedToStart'],
    },
  };
}

function failureLogTarget(logs: LogGroup): CfnRule.TargetProperty {
  const stack = Stack.of(logs);
  return {
    id: 'FailureLogs',
    arn: stack.formatArn({
      service: 'logs',
      resource: 'log-group',
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
      resourceName: logs.logGroupName,
    }),
    inputTransformer: {
      inputPathsMap: { time: '$.time', task: '$.detail.taskArn', code: '$.detail.stopCode' },
      // Omit container overrides, network details and free-text stopped reasons.
      inputTemplate: JSON.stringify({
        timestamp: '<time>',
        message: JSON.stringify({
          metric: 'task-failure',
          taskFailure: 1,
          taskArn: '<task>',
          stopCode: '<code>',
        }),
      }),
    },
  };
}
