import { Duration, RemovalPolicy, Validations } from 'aws-cdk-lib';
import { BackupPlan, BackupResource } from 'aws-cdk-lib/aws-backup';
import {
  FlowLogDestination,
  FlowLogTrafficType,
  GatewayVpcEndpointAwsService,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Port,
  SecurityGroup,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import {
  Credentials,
  DatabaseInstance,
  DatabaseInstanceEngine,
  ParameterGroup,
  PostgresEngineVersion,
  StorageType,
} from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';
import type { StageConfig } from './config.js';

const POSTGRES = DatabaseInstanceEngine.postgres({ version: PostgresEngineVersion.VER_17_9 });

/**
 * The network and the database (P08.3, ADR-008 §1).
 *
 * Two AZs. Tasks run in public subnets with a public IPv4 for egress only: no
 * NAT gateway and no interface endpoints, which is most of what fits the
 * budget. Their security group admits nothing but the VPC link (added with the
 * service in P08.4). RDS sits in isolated subnets and accepts 5432 from the app
 * security group alone. S3 goes through the free gateway endpoint.
 */
export class NetworkDatabase extends Construct {
  readonly vpc: Vpc;
  readonly appSecurityGroup: SecurityGroup;
  readonly database: DatabaseInstance;

  constructor(scope: Construct, id: string, stage: StageConfig) {
    super(scope, id);
    this.vpc = this.createVpc(stage);
    this.appSecurityGroup = new SecurityGroup(this, 'AppSg', {
      vpc: this.vpc,
      description: 'App tasks: inbound only from the VPC link; egress 443 and 5432 to RDS',
      allowAllOutbound: false,
    });
    this.database = this.createDatabase(stage);
    this.backUp();
  }

  private createVpc(stage: StageConfig): Vpc {
    const vpc = new Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'app', subnetType: SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'data', subnetType: SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
      gatewayEndpoints: { S3: { service: GatewayVpcEndpointAwsService.S3 } },
    });
    // Rejected traffic only: it is what an investigation needs, at a fraction of the volume.
    vpc.addFlowLog('RejectedFlows', {
      trafficType: FlowLogTrafficType.REJECT,
      destination: FlowLogDestination.toCloudWatchLogs(
        new LogGroup(this, 'FlowLogs', {
          retention: RetentionDays.ONE_MONTH,
          removalPolicy: stage.name === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
        }),
      ),
    });
    return vpc;
  }

  private createDatabase(stage: StageConfig): DatabaseInstance {
    const dbSecurityGroup = new SecurityGroup(this, 'DbSg', {
      vpc: this.vpc,
      description: 'RDS: 5432 from the app tasks only',
      allowAllOutbound: false,
    });
    dbSecurityGroup.addIngressRule(this.appSecurityGroup, Port.tcp(5432), 'app tasks');
    this.appSecurityGroup.addEgressRule(dbSecurityGroup, Port.tcp(5432), 'to RDS');

    const [size, klass] = parseInstanceClass(stage.database.instanceClass);
    const database = new DatabaseInstance(this, 'Postgres', {
      engine: POSTGRES,
      instanceType: InstanceType.of(klass, size),
      vpc: this.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      credentials: Credentials.fromGeneratedSecret('spoh_admin'),
      databaseName: 'spoh',
      multiAz: false,
      storageType: StorageType.GP3,
      allocatedStorage: stage.database.allocatedStorageGiB,
      maxAllocatedStorage: stage.database.maxStorageGiB,
      storageEncrypted: true,
      backupRetention: Duration.days(7),
      deletionProtection: true,
      removalPolicy: RemovalPolicy.SNAPSHOT,
      autoMinorVersionUpgrade: true,
      publiclyAccessible: false,
      parameterGroup: new ParameterGroup(this, 'Params', {
        engine: POSTGRES,
        parameters: { 'rds.force_ssl': '1' },
      }),
      cloudwatchLogsExports: ['postgresql'],
    });
    acknowledgeDatabaseChoices(database);
    return database;
  }

  /** AWS Backup, daily, kept 35 days, on top of RDS's own 7-day PITR. */
  private backUp(): void {
    const plan = BackupPlan.daily35DayRetention(this, 'Backups');
    plan.addSelection('Postgres', {
      resources: [BackupResource.fromRdsDatabaseInstance(this.database)],
    });
    Validations.of(plan).acknowledge({
      id: 'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup]',
      reason:
        'The AWS-managed service policy AWS Backup documents for its selection role; the service scopes it.',
    });
  }
}

function parseInstanceClass(value: string): [InstanceSize, InstanceClass] {
  const [klass, size] = value.split('.');
  return [size as InstanceSize, klass as InstanceClass];
}

/** Each accepted AwsSolutions finding, with the decision behind it. */
function acknowledgeDatabaseChoices(database: DatabaseInstance): void {
  const reasons: Record<string, string> = {
    'AwsSolutions-RDS3':
      'Single-AZ by ADR-008 §1 (budget D-10); the client outbox queues captures during a failover, and Multi-AZ for event week is a priced option.',
    'AwsSolutions-RDS11':
      'The default port is kept: the database is in isolated subnets and admits only the app security group.',
    'AwsSolutions-SMG4':
      'Rotation needs a Lambda that can reach Secrets Manager, which this VPC deliberately cannot without NAT or an interface endpoint; P08.6 decides it with the other secrets.',
  };
  for (const [id, reason] of Object.entries(reasons)) {
    Validations.of(database).acknowledge({ id, reason });
  }
}
