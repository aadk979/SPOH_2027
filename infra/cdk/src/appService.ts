import { CfnOutput, Duration, RemovalPolicy, Stack, Validations } from 'aws-cdk-lib';
import { AccessLogFormat } from 'aws-cdk-lib/aws-apigateway';
import {
  type CfnStage,
  HttpApi,
  HttpMethod,
  HttpStage,
  LogGroupLogDestination,
  VpcLink,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpServiceDiscoveryIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Peer, Port, SecurityGroup, SubnetType } from 'aws-cdk-lib/aws-ec2';
import type { IRepository } from 'aws-cdk-lib/aws-ecr';
import {
  Cluster,
  ContainerImage,
  ContainerInsights,
  CpuArchitecture,
  FargateService,
  FargateTaskDefinition,
  LogDrivers,
  OperatingSystemFamily,
  Secret as EcsSecret,
} from 'aws-cdk-lib/aws-ecs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { DnsRecordType, NamespaceType } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';
import type { AppSecrets } from './appSecrets.js';
import type { StageConfig } from './config.js';
import type { NetworkDatabase } from './networkDatabase.js';
import type { CognitoSettings } from './stagingIdentity.js';
import { AppInfrastructureConfig } from './appInfrastructureConfig.js';
import { SchedulerMonitoring } from './schedulerMonitoring.js';
import { HttpMonitoring } from './httpMonitoring.js';
import { CacheBusMonitoring } from './cacheBusMonitoring.js';
import { TaskFailureMonitoring } from './taskFailureMonitoring.js';
import type { Bucket } from 'aws-cdk-lib/aws-s3';
import { grantPhotoObjects } from './mediaAccess.js';

const PORT = 4000;

export interface AppServiceProps {
  stage: StageConfig;
  data: NetworkDatabase;
  secrets: AppSecrets;
  repository: IRepository;
  /** The image the migrate task runs: the release being rolled out. */
  imageTag: string;
  /** The image the service runs; absent until a first migration has run. */
  serviceImageTag?: string;
  /** The HTTP API this service sits behind (created first, so its URL is known). */
  api: HttpApi;
  cognito: CognitoSettings;
  /** Enabled only after the stage has an approved exact client origin for S3 CORS. */
  mediaBucket?: Bucket;
}

/**
 * The one Fargate service and its edge (P08.4, ADR-008 §1): ARM64 tasks in the
 * public subnets, registered in Cloud Map, reached only through the HTTP API's
 * VPC link. A migrate task definition runs the same image before each release.
 */
export class AppService extends Construct {
  readonly service?: FargateService;
  readonly migrateTask: FargateTaskDefinition;
  private readonly configuration: AppInfrastructureConfig;

  constructor(scope: Construct, id: string, props: AppServiceProps) {
    super(scope, id);
    const { stage, data } = props;
    const cluster = new Cluster(this, 'Cluster', {
      vpc: data.vpc,
      containerInsightsV2: ContainerInsights.DISABLED,
      defaultCloudMapNamespace: {
        name: `spoh-${stage.name}.internal`,
        type: NamespaceType.DNS_PRIVATE,
        vpc: data.vpc,
      },
    });
    const logs = new LogGroup(this, 'AppLogs', {
      logGroupName: `/spoh/${stage.name}/app`,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: stage.name === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    new SchedulerMonitoring(this, 'SchedulerMonitoring', { stage: stage.name, logGroup: logs });
    new CacheBusMonitoring(this, 'CacheBusMonitoring', { stage: stage.name, logGroup: logs });
    const imageOf = (tag: string) => ContainerImage.fromEcrRepository(props.repository, tag);
    this.configuration = new AppInfrastructureConfig(this, 'Configuration', {
      stage,
      databaseHost: data.database.dbInstanceEndpointAddress,
      appOrigin: props.api.apiEndpoint,
      cognito: props.cognito,
      port: PORT,
      ...(props.mediaBucket ? { mediaBucketName: props.mediaBucket.bucketName } : {}),
    });

    this.migrateTask = this.migrationTask(props, imageOf(props.imageTag), logs);
    // Egress for Cognito, Secrets Manager, ECR and S3; RDS has its own rule.
    data.appSecurityGroup.addEgressRule(Peer.anyIpv4(), Port.tcp(443), 'AWS APIs and Cognito');
    Validations.of(cluster).acknowledge({
      id: 'AwsSolutions-ECS4',
      reason:
        'Container Insights costs more than the budget allows (D-10); the service, task and API alarms of P08.8 use the free metrics.',
    });
    this.outputs(cluster, data);
    if (!props.serviceImageTag) return;

    const task = this.appTask(props, imageOf(props.serviceImageTag), logs);
    this.service = new FargateService(this, 'Service', {
      cluster,
      taskDefinition: task,
      desiredCount: stage.app.desiredCount,
      assignPublicIp: true,
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
      securityGroups: [data.appSecurityGroup],
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: Duration.seconds(60),
      cloudMapOptions: { name: 'app', dnsRecordType: DnsRecordType.SRV, containerPort: PORT },
    });
    new TaskFailureMonitoring(this, 'TaskFailureMonitoring', {
      stage: stage.name,
      service: this.service,
    });
    this.route(props, this.service);
    new CfnOutput(Stack.of(this), 'ServiceImageTag', { value: props.serviceImageTag });
  }

  /** What the release workflow needs to run the migrate task. */
  private outputs(cluster: Cluster, data: NetworkDatabase): void {
    const stack = Stack.of(this);
    new CfnOutput(stack, 'ClusterName', { value: cluster.clusterName });
    new CfnOutput(stack, 'MigrateTaskDefinition', { value: this.migrateTask.taskDefinitionArn });
    new CfnOutput(stack, 'AppSubnets', {
      value: data.vpc.publicSubnets.map((subnet) => subnet.subnetId).join(','),
    });
    new CfnOutput(stack, 'AppSecurityGroup', { value: data.appSecurityGroup.securityGroupId });
  }

  private appTask(props: AppServiceProps, image: ContainerImage, logs: LogGroup) {
    const { stage, secrets } = props;
    const task = new FargateTaskDefinition(this, 'AppTask', {
      cpu: stage.app.cpu,
      memoryLimitMiB: stage.app.memoryMiB,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
    });
    task.addContainer('app', {
      image,
      command: ['serve'],
      logging: LogDrivers.awsLogs({ logGroup: logs, streamPrefix: 'app' }),
      portMappings: [{ containerPort: PORT, name: 'http' }],
      secrets: {
        ...this.configuration.appInjections,
        DB_APP_PASSWORD: EcsSecret.fromSecretsManager(secrets.appDbPassword),
        SESSION_SIGNING_SECRET: EcsSecret.fromSecretsManager(secrets.sessionSigningSecret),
      },
      healthCheck: {
        command: [
          'CMD',
          'node',
          '-e',
          "fetch('http://127.0.0.1:4000/readyz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))",
        ],
        interval: Duration.seconds(15),
        timeout: Duration.seconds(5),
        startPeriod: Duration.seconds(30),
        retries: 3,
      },
    });
    if (props.mediaBucket) grantPhotoObjects(task, props.mediaBucket);
    acknowledgeTask(task);
    return task;
  }

  private migrationTask(props: AppServiceProps, image: ContainerImage, logs: LogGroup) {
    const { data, secrets } = props;
    const task = new FargateTaskDefinition(this, 'MigrateTask', {
      // A fixed family: the CI role may run this task and nothing else.
      family: `spoh-${props.stage.name}-migrate`,
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
    });
    const admin = data.database.secret!;
    task.addContainer('migrate', {
      image,
      command: ['migrate'],
      logging: LogDrivers.awsLogs({ logGroup: logs, streamPrefix: 'migrate' }),
      secrets: {
        ...this.configuration.migrationInjections,
        DB_ADMIN_USER: EcsSecret.fromSecretsManager(admin, 'username'),
        DB_ADMIN_PASSWORD: EcsSecret.fromSecretsManager(admin, 'password'),
        DB_MIGRATOR_PASSWORD: EcsSecret.fromSecretsManager(secrets.migratorDbPassword),
        DB_APP_PASSWORD: EcsSecret.fromSecretsManager(secrets.appDbPassword),
      },
    });
    acknowledgeTask(task);
    return task;
  }

  /** The HTTP API's routes into the service, through a VPC link, with throttling. */
  private route(props: AppServiceProps, service: FargateService): void {
    const { data, api } = props;
    const linkSg = new SecurityGroup(this, 'VpcLinkSg', {
      vpc: data.vpc,
      description: 'The HTTP API VPC link: out to the app tasks only',
      allowAllOutbound: false,
    });
    linkSg.addEgressRule(data.appSecurityGroup, Port.tcp(PORT), 'to the app');
    data.appSecurityGroup.addIngressRule(linkSg, Port.tcp(PORT), 'from the HTTP API only');
    const vpcLink = new VpcLink(this, 'VpcLink', {
      vpc: data.vpc,
      subnets: { subnetType: SubnetType.PUBLIC },
      securityGroups: [linkSg],
    });
    const integration = new HttpServiceDiscoveryIntegration('App', service.cloudMapService!, {
      vpcLink,
    });
    const routes = ['/', '/{proxy+}', '/api/v1/auth/{proxy+}'].flatMap((path) =>
      api.addRoutes({ path, methods: [HttpMethod.ANY], integration }),
    );
    // Sign-in is throttled harder at the edge (ADR-008 §4); throttled requests
    // never reach the app. The setting names a route, so it waits for the routes.
    const stage = api.node.scope!.node.findChild('DefaultStage') as HttpStage;
    (stage.node.defaultChild as CfnStage).addPropertyOverride('RouteSettings', {
      'ANY /api/v1/auth/{proxy+}': { ThrottlingRateLimit: 5, ThrottlingBurstLimit: 10 },
    });
    for (const route of routes) stage.node.addDependency(route);
  }
}

/**
 * One JSON line per request (P08.8). Beyond the default Common Log Format it
 * records the integration status, latency and error message, so a 503 that the
 * gateway produced without reaching the app (integrationStatus "-") says why.
 * The gateway writes an absent value as a bare -, so every variable sits inside
 * quotes, including the error message: the pre-quoted messageString variant is
 * also a bare - when there is no error, which made every successful request's
 * line invalid JSON. Gateway error messages are fixed phrases without quotes.
 */
export const API_ACCESS_LOG_FORMAT = `{${[
  '"requestId":"$context.requestId"',
  '"requestTime":"$context.requestTimeEpoch"',
  '"ip":"$context.identity.sourceIp"',
  '"method":"$context.httpMethod"',
  '"path":"$context.path"',
  '"routeKey":"$context.routeKey"',
  '"protocol":"$context.protocol"',
  '"status":"$context.status"',
  '"responseLength":"$context.responseLength"',
  '"responseLatency":"$context.responseLatency"',
  '"integrationStatus":"$context.integration.status"',
  '"integrationLatency":"$context.integration.latency"',
  '"integrationError":"$context.integrationErrorMessage"',
  '"errorType":"$context.error.responseType"',
  '"errorMessage":"$context.error.message"',
].join(',')}}`;

/** The HTTP API and its throttled, logged stage, created before the service. */
export function createHttpApi(scope: Construct, stage: StageConfig): HttpApi {
  const api = new HttpApi(scope, 'HttpApi', {
    apiName: `spoh-${stage.name}`,
    createDefaultStage: false,
  });
  const accessLogs = new LogGroup(scope, 'ApiAccessLogs', {
    retention: RetentionDays.ONE_MONTH,
    removalPolicy: stage.name === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
  });
  new HttpStage(scope, 'DefaultStage', {
    httpApi: api,
    stageName: '$default',
    autoDeploy: true,
    throttle: { rateLimit: 50, burstLimit: 100 },
    accessLogSettings: {
      destination: new LogGroupLogDestination(accessLogs),
      format: AccessLogFormat.custom(API_ACCESS_LOG_FORMAT),
    },
  });
  Validations.of(api).acknowledge({
    id: 'AwsSolutions-APIG4',
    reason:
      'The app authenticates every API route itself (requireAuth, default deny) and serves the public client pages; an API Gateway authorizer would duplicate it.',
  });
  new CfnOutput(Stack.of(scope), 'AppUrl', { value: api.apiEndpoint });
  new HttpMonitoring(scope, 'HttpMonitoring', { stage: stage.name, api });
  return api;
}

function acknowledgeTask(task: FargateTaskDefinition): void {
  Validations.of(task).acknowledge({
    id: 'AwsSolutions-IAM5[Resource::*]',
    reason:
      'The execution role ecr:GetAuthorizationToken, which AWS only grants on "*"; image pulls, secret reads and SSM reads are scoped to their resources.',
  });
}
