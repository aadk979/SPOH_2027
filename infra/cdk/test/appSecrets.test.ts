import { createECDH } from 'node:crypto';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
// @ts-expect-error Key provisioning runs as authored ESM and never prints secret material.
import { vapidKeys } from '../../scripts/provision-vapid.mjs';

describe('task signing secrets', () => {
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
