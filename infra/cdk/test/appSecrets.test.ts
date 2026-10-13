import { createECDH } from 'node:crypto';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
// @ts-expect-error Key provisioning runs as authored ESM and never prints secret material.
import { vapidKeys } from '../../scripts/provision-vapid.mjs';

describe('task signing secrets', () => {
  it('pins current and previous versions of one ARN only in app tasks', () => {
    const current = '11111111-1111-4111-8111-111111111111';
    const previous = '22222222-2222-4222-8222-222222222222';
    const app = buildApp(new App({ context: { imageTag: 'release', serviceImageTag: 'release',
      sessionSigningVersions: { staging: { current, previous } } } }));
    const template = Template.fromStack(app.node.findChild('Spoh-staging-Platform') as never);
    for (const task of Object.values(template.findResources('AWS::ECS::TaskDefinition'))) {
      const container = task.Properties.ContainerDefinitions[0];
      const signing = container.Secrets.filter((secret: { Name: string }) => secret.Name.startsWith('SESSION_SIGNING_SECRET'));
      if (container.Name !== 'app') { expect(signing).toEqual([]); continue; }
      expect(signing).toHaveLength(2);
      const writer = signing.find((secret: { Name: string }) => secret.Name === 'SESSION_SIGNING_SECRET');
      const verifier = signing.find((secret: { Name: string }) => secret.Name === 'SESSION_SIGNING_SECRET_PREVIOUS');
      expect(JSON.stringify(writer.ValueFrom)).toContain(`:::${current}`);
      expect(JSON.stringify(verifier.ValueFrom)).toContain(`:::${previous}`);
      expect(writer.ValueFrom['Fn::Join'][1][0]).toEqual(verifier.ValueFrom['Fn::Join'][1][0]);
    }
    expect(Object.values(template.findResources('AWS::SecretsManager::Secret')).filter(
      (secret) => secret.Properties.Name?.includes('session-signing'))).toHaveLength(1);
  });

  it.each([
    { previous: '22222222-2222-4222-8222-222222222222' },
    { current: 'short' },
    { current: '11111111-1111-4111-8111-111111111111', previous: '11111111-1111-4111-8111-111111111111' },
    { current: '11111111-1111-4111-8111-111111111111', versionStage: 'AWSCURRENT' },
  ])('refuses unsafe signing selectors %j', (selectors) => {
    expect(() => buildApp(new App({ context: { imageTag: 'release', serviceImageTag: 'release',
      sessionSigningVersions: { staging: selectors } } }))).toThrow();
  });

  it('requires an explicit initial current version parameter and does not inject an absent previous key', () => {
    const app = buildApp(new App({ context: { imageTag: 'release', serviceImageTag: 'release' } }));
    const template = Template.fromStack(app.node.findChild('Spoh-staging-Platform') as never);
    expect(template.toJSON().Parameters.SessionSigningCurrentVersionId).toMatchObject({ Type: 'String' });
    expect(template.toJSON().Parameters.SessionSigningCurrentVersionId.Default).toBeUndefined();
    const task = Object.values(template.findResources('AWS::ECS::TaskDefinition')).find(
      (resource) => resource.Properties.ContainerDefinitions[0].Name === 'app')!;
    const names = task.Properties.ContainerDefinitions[0].Secrets.map((secret: { Name: string }) => secret.Name);
    expect(names).not.toContain('SESSION_SIGNING_SECRET_PREVIOUS');
  });
  it('injects attendance and valid imported VAPID fields only into the app execution role', () => {
    const app = buildApp(
      new App({
        context: {
          imageTag: 'release',
          serviceImageTag: 'release',
          vapidSecretArn:
            'arn:aws:secretsmanager:ap-southeast-1:665146708212:secret:spoh/staging/vapid-abcdef',
        },
      }),
    );
    const template = Template.fromStack(app.node.findChild('Spoh-staging-Platform') as never);
    const tasks = Object.values(template.findResources('AWS::ECS::TaskDefinition'));
    for (const task of tasks) {
      const container = task.Properties.ContainerDefinitions[0];
      const names = container.Secrets.map((secret: { Name: string }) => secret.Name);
      if (container.Name === 'app')
        expect(names).toEqual(
          expect.arrayContaining([
            'ATTENDANCE_SIGNING_SECRET',
            'VAPID_PUBLIC_KEY',
            'VAPID_PRIVATE_KEY',
            'VAPID_SUBJECT',
          ]),
        );
      else expect(names).not.toContain('VAPID_PRIVATE_KEY');
    }
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'spoh/staging/attendance-signing-secret',
      GenerateSecretString: { PasswordLength: 64 },
    });
  });
  it('generates a matched P-256 VAPID pair and validates its contact subject', () => {
    const keys = vapidKeys('mailto:operator@example.test');
    expect(Buffer.from(keys.publicKey, 'base64url')).toHaveLength(65);
    expect(Buffer.from(keys.privateKey, 'base64url')).toHaveLength(32);
    const key = createECDH('prime256v1');
    key.setPrivateKey(Buffer.from(keys.privateKey, 'base64url'));
    expect(key.getPublicKey().toString('base64url')).toBe(keys.publicKey);
    expect(() => vapidKeys('someone')).toThrow('subject');
  });
});
