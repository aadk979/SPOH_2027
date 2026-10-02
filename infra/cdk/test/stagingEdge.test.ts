import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { StagingEdgeStack } from '../src/stagingEdgeStack.js';
import { stagingCaddyfile, stagingEdgeBootstrap } from '../src/stagingEdgeAssets.js';

const UPSTREAM = 'https://example123.execute-api.ap-southeast-1.amazonaws.com';
const app = buildApp(new App({ context: { stagingEdge: true } }));
const edge = app.node.findChild('Spoh-staging-Edge');
if (!(edge instanceof StagingEdgeStack)) throw new Error('Missing explicit edge stack');
const template = Template.fromStack(edge);

it('synthesises the explicit staging edge with nag checks and no production edge', () => {
  expect(() => app.synth()).not.toThrow();
  expect(app.node.tryFindChild('Spoh-prod-Edge')).toBeUndefined();
});

it('creates only the approved Micro and an immediately attached static IPv4', () => {
  template.resourceCountIs('AWS::Lightsail::Instance', 1);
  template.resourceCountIs('AWS::Lightsail::StaticIp', 1);
  template.hasResourceProperties('AWS::Lightsail::Instance', {
    InstanceName: 'spoh-staging-edge',
    BlueprintId: 'ubuntu_24_04',
    BundleId: 'micro_3_0',
    AvailabilityZone: 'ap-southeast-1a',
  });
  template.hasResourceProperties('AWS::Lightsail::StaticIp', {
    StaticIpName: 'spoh-staging-edge-ip',
    AttachedTo: { Ref: 'Proxy' },
  });
  const types = Object.values(template.toJSON().Resources).map(
    (row) => (row as { Type: string }).Type,
  );
  expect(types.filter((type) => type !== 'AWS::CDK::Metadata').sort()).toEqual([
    'AWS::Lightsail::Instance',
    'AWS::Lightsail::StaticIp',
  ]);
  expect(JSON.stringify(template.toJSON())).not.toContain('spoh-app');
  expect(JSON.stringify(template.toJSON())).not.toContain('spoh-static-ip');
});

it('opens HTTPS/challenge ports and restricts SSH to the deploy-time operator /32', () => {
  template.hasResourceProperties('AWS::Lightsail::Instance', {
    Networking: {
      Ports: [
        { Protocol: 'tcp', FromPort: 80, ToPort: 80, Cidrs: ['0.0.0.0/0'], Ipv6Cidrs: [] },
        { Protocol: 'tcp', FromPort: 443, ToPort: 443, Cidrs: ['0.0.0.0/0'], Ipv6Cidrs: [] },
        {
          Protocol: 'tcp',
          FromPort: 22,
          ToPort: 22,
          Cidrs: [{ Ref: 'OperatorSshCidr' }],
          Ipv6Cidrs: [],
        },
      ],
    },
  });
  template.hasParameter('OperatorSshCidr', { AllowedPattern: Match.stringLikeRegexp('/32') });
  template.hasParameter('ApiOrigin', { AllowedPattern: Match.stringLikeRegexp('execute-api') });
});

it('renders separate hosts, verified upstream TLS and a public bootstrap health probe', () => {
  const file = stagingCaddyfile(UPSTREAM);
  expect(file).toContain('secure-channel.duckdns.org {');
  expect(file).toContain('api.secure-channel.duckdns.org {');
  expect(file.match(/reverse_proxy https:\/\/example123/g)).toHaveLength(2);
  expect(file).not.toContain('header_up Host');
  expect(file).toContain('@api path /api/* /healthz');
  expect(file).toContain('@private path /readyz');
  expect(file).toContain('http://:80');
  expect(file).not.toContain('tls_insecure_skip_verify');
  expect(file).not.toContain('dns duckdns');
  expect(file).not.toContain('@@');
});

it('pins and verifies Caddy, persists certificates and runs an unprivileged systemd service', () => {
  const bootstrap = stagingEdgeBootstrap(UPSTREAM);
  expect(bootstrap).toContain('caddy_2.11.6_linux_amd64.tar.gz');
  expect(bootstrap).toContain('sha512sum --check');
  expect(bootstrap).toContain("--proto '=https'");
  expect(bootstrap).toContain('User=caddy');
  expect(bootstrap).toContain('Environment=XDG_DATA_HOME=/var/lib/caddy');
  expect(bootstrap).toContain('ReadWritePaths=/var/lib/caddy');
  expect(bootstrap).toContain('NoNewPrivileges=true');
  expect(bootstrap).toContain('validate --config');
  expect(bootstrap).toContain('systemctl enable --now caddy');
  expect(bootstrap).not.toContain('\r');
  expect(bootstrap).not.toContain('@@');
});
