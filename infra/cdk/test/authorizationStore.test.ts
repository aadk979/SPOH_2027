import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { readPolicyStoreFile } from '../src/authorizationStore.js';
import { compareStores, hasDrift } from '../src/avpDrift.js';
import { PlatformStack } from '../src/platformStack.js';

const app = buildApp(
  new App({ context: { imageTag: 'verified-release', serviceImageTag: 'verified-release' } }),
);
const file = readPolicyStoreFile();

function templateOf(stage: 'staging' | 'prod') {
  const stack = app.node.findChild(`Spoh-${stage}-Platform`);
  if (!(stack instanceof PlatformStack)) throw new Error('Expected platform stack');
  return Template.fromStack(stack);
}

describe('the AVP policy store (P11.6)', () => {
  it.each(['staging', 'prod'] as const)(
    '%s: one STRICT store with the schema and exactly the repo policies',
    (stage) => {
      const template = templateOf(stage);
      template.resourceCountIs('AWS::VerifiedPermissions::PolicyStore', 1);
      const store = Object.values(
        template.findResources('AWS::VerifiedPermissions::PolicyStore'),
      )[0]!;
      expect(store.Properties.ValidationSettings).toEqual({ Mode: 'STRICT' });
      expect(JSON.parse(store.Properties.Schema.CedarJson)).toEqual(file.schema);
      expect(store.Properties.DeletionProtection).toEqual({
        Mode: stage === 'prod' ? 'ENABLED' : 'DISABLED',
      });
      const policies = Object.values(template.findResources('AWS::VerifiedPermissions::Policy'));
      expect(policies.map((p) => p.Properties.Definition.Static.Description).sort()).toEqual(
        file.policies.map((p) => p.id).sort(),
      );
    },
  );

  it('lets the app ask the store and nothing else', () => {
    const template = templateOf('staging');
    const statements = Object.values(template.findResources('AWS::IAM::Policy')).flatMap(
      (policy) => policy.Properties.PolicyDocument.Statement as { Action: string | string[] }[],
    );
    const avp = statements.flatMap((statement) =>
      [statement.Action].flat().filter((action) => action.startsWith('verifiedpermissions:')),
    );
    expect(avp).toEqual(['verifiedpermissions:IsAuthorized']);
  });

  it('gives the app the store and its policy names', () => {
    const template = templateOf('staging');
    const tasks = Object.values(template.findResources('AWS::ECS::TaskDefinition'));
    const environment = tasks.flatMap((task) =>
      (task.Properties.ContainerDefinitions as { Environment?: { Name: string }[] }[]).flatMap(
        (container) => (container.Environment ?? []).map((entry) => entry.Name),
      ),
    );
    expect(environment).toEqual(
      expect.arrayContaining(['AVP_POLICY_STORE_ID', 'AVP_POLICY_NAMES']),
    );
  });
});

describe('AVP drift (P11.6)', () => {
  const expected = {
    schema: { a: 1, b: [1, 2] },
    policies: { one: 'permit (p, a, r);', two: 'forbid (p, a, r);' },
  };

  it('finds none when the store matches, whatever the whitespace and key order', () => {
    const drift = compareStores(expected, {
      schema: { b: [1, 2], a: 1 },
      policies: { two: 'forbid (p,\n a, r);', one: 'permit (p, a, r);' },
    });
    expect(hasDrift(drift)).toBe(false);
  });

  it('names missing, extra and changed policies, and a changed schema', () => {
    const drift = compareStores(expected, {
      schema: { a: 2, b: [1, 2] },
      policies: { one: 'permit (p, a, r) when { true };', three: 'permit (p, a, r);' },
    });
    expect(drift).toEqual({
      missing: ['two'],
      extra: ['three'],
      changed: ['one'],
      schemaChanged: true,
    });
    expect(hasDrift(drift)).toBe(true);
  });
});

describe('AVP alarms (P11.9)', () => {
  it.each(['staging', 'prod'] as const)(
    '%s alarms on AVP failures, throttles, latency and degraded decisions',
    (stage) => {
      const template = templateOf(stage);
      const alarms = Object.values(template.findResources('AWS::CloudWatch::Alarm')).map(
        (alarm) => alarm.Properties as { AlarmName: string; MetricName: string; Threshold: number },
      );
      for (const [name, metric, threshold] of [
        [`spoh-${stage}-avp-failed`, 'AvpFailed', 0],
        [`spoh-${stage}-avp-throttled`, 'AvpThrottled', 0],
        [`spoh-${stage}-avp-latency-p95`, 'AvpLatencyP95', 150],
        [`spoh-${stage}-authorization-degraded`, 'AuthorizationDegraded', 0],
      ] as const) {
        expect(alarms).toContainEqual(
          expect.objectContaining({ AlarmName: name, MetricName: metric, Threshold: threshold }),
        );
      }
      const filters = Object.values(template.findResources('AWS::Logs::MetricFilter')).map(
        (filter) => filter.Properties.MetricTransformations[0].MetricName as string,
      );
      expect(filters).toEqual(
        expect.arrayContaining([
          'AvpFailed',
          'AvpThrottled',
          'AvpLatencyP95',
          'AuthorizationDegraded',
        ]),
      );
    },
  );
});
