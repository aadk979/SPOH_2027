import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const app = buildApp(new App());
const template = Template.fromStack(app.node.findChild('Spoh-staging-Platform') as never);

describe('network (P08.3, ADR-008 §1)', () => {
  it('has no NAT gateway and no interface endpoints, only the free S3 gateway endpoint', () => {
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
    const endpoints = Object.values(template.findResources('AWS::EC2::VPCEndpoint'));
    expect(endpoints.map((endpoint) => endpoint.Properties.VpcEndpointType ?? 'Gateway')).toEqual([
      'Gateway',
    ]);
  });

  it('spans two AZs with public app subnets and isolated data subnets', () => {
    template.resourceCountIs('AWS::EC2::Subnet', 4);
    template.resourcePropertiesCountIs('AWS::EC2::Subnet', { MapPublicIpOnLaunch: true }, 2);
  });

  it('logs rejected traffic', () => {
    template.hasResourceProperties('AWS::EC2::FlowLog', { TrafficType: 'REJECT' });
  });
});

describe('database (P08.3)', () => {
  it('is a private, encrypted, single-AZ Postgres 17 micro with PITR and deletion protection', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      EngineVersion: Match.stringLikeRegexp('^17\.'),
      DBInstanceClass: 'db.t4g.micro',
      MultiAZ: false,
      PubliclyAccessible: false,
      StorageEncrypted: true,
      StorageType: 'gp3',
      AllocatedStorage: '20',
      MaxAllocatedStorage: 100,
      BackupRetentionPeriod: 7,
      DeletionProtection: true,
    });
    template.hasResource('AWS::RDS::DBInstance', { DeletionPolicy: 'Snapshot' });
  });

  it('forces TLS', () => {
    template.hasResourceProperties('AWS::RDS::DBParameterGroup', {
      Parameters: { 'rds.force_ssl': '1' },
    });
  });

  it('accepts 5432 from the app security group and nothing else', () => {
    const ingress = Object.values(template.findResources('AWS::EC2::SecurityGroupIngress'));
    expect(ingress).toHaveLength(1);
    expect(ingress[0]!.Properties).toMatchObject({
      FromPort: 5432,
      ToPort: 5432,
      IpProtocol: 'tcp',
    });
    expect(ingress[0]!.Properties.SourceSecurityGroupId).toBeDefined();
    const inline = Object.values(template.findResources('AWS::EC2::SecurityGroup')).flatMap(
      (group) => group.Properties.SecurityGroupIngress ?? [],
    );
    expect(inline).toEqual([]);
  });

  it('is backed up daily by AWS Backup and kept 35 days', () => {
    template.hasResourceProperties('AWS::Backup::BackupPlan', {
      BackupPlan: {
        BackupPlanRule: Match.arrayWith([Match.objectLike({ Lifecycle: { DeleteAfterDays: 35 } })]),
      },
    });
  });
});
