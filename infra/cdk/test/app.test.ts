import { App } from 'aws-cdk-lib';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { STAGES } from '../src/config.js';

describe('CDK app (P08.1)', () => {
  const app = buildApp(new App());
  const stacks = app.node.children.filter((child) => 'templateOptions' in child);

  it('defines one platform stack per stage, in the stage account and region', () => {
    expect(stacks.map((stack) => stack.node.id).sort()).toEqual([
      'Spoh-prod-Platform',
      'Spoh-staging-Platform',
    ]);
  });

  it('synthesises with the AwsSolutions checks passing', () => {
    // The nag pack is a validation plugin: any unsuppressed finding throws here.
    expect(() => app.synth()).not.toThrow();
  });

  it('keeps the production Cognito pool referenced, never owned', () => {
    expect(STAGES.prod.existingUserPoolId).toBe('ap-southeast-1_9bwl2nGF7');
    expect(STAGES.staging.existingUserPoolId).toBeUndefined();
  });
});
