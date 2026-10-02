import { CfnOutput, CfnParameter, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnInstance, CfnStaticIp } from 'aws-cdk-lib/aws-lightsail';
import type { Construct } from 'constructs';
import { STAGING_EDGE } from './config.js';
import { stagingEdgeBootstrap } from './stagingEdgeAssets.js';

/** Separate staging-only proxy; this stack has no reference to the existing live Lightsail site. */
export class StagingEdgeStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const upstream = new CfnParameter(this, 'ApiOrigin', {
      type: 'String',
      description:
        'Existing staging HTTP API HTTPS origin, from the staging Platform AppUrl output',
      allowedPattern: '^https://[a-z0-9]+\\.execute-api\\.ap-southeast-1\\.amazonaws\\.com$',
    });
    const operator = new CfnParameter(this, 'OperatorSshCidr', {
      type: 'String',
      description: 'Current operator public IPv4 /32; SSH is never open to the internet',
      allowedPattern: '^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}/32$',
    });
    const proxy = new CfnInstance(this, 'Proxy', {
      instanceName: STAGING_EDGE.instanceName,
      blueprintId: STAGING_EDGE.blueprintId,
      bundleId: STAGING_EDGE.bundleId,
      availabilityZone: `${this.region}a`,
      networking: {
        ports: [
          { protocol: 'tcp', fromPort: 80, toPort: 80, cidrs: ['0.0.0.0/0'], ipv6Cidrs: [] },
          { protocol: 'tcp', fromPort: 443, toPort: 443, cidrs: ['0.0.0.0/0'], ipv6Cidrs: [] },
          {
            protocol: 'tcp',
            fromPort: 22,
            toPort: 22,
            cidrs: [operator.valueAsString],
            ipv6Cidrs: [],
          },
        ],
      },
      userData: stagingEdgeBootstrap(upstream.valueAsString),
    });
    const address = new CfnStaticIp(this, 'PublicAddress', {
      staticIpName: STAGING_EDGE.staticIpName,
      attachedTo: proxy.ref,
    });
    new CfnOutput(this, 'PublicIp', { value: address.attrIpAddress });
    new CfnOutput(this, 'InstanceName', { value: STAGING_EDGE.instanceName });
    new CfnOutput(this, 'ClientUrl', { value: `https://${STAGING_EDGE.clientHost}` });
    new CfnOutput(this, 'ApiUrl', { value: `https://${STAGING_EDGE.apiHost}` });
  }
}
