import { App, Tags, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { ACCOUNT_ENV, REPOSITORY, STAGES, type StageConfig } from './config.js';
import { DeployAccessStack } from './deployAccessStack.js';
import { PlatformStack } from './platformStack.js';

function tag(stage: StageConfig, stack: PlatformStack): void {
  for (const [key, value] of Object.entries(stage.tags)) Tags.of(stack).add(key, value);
}

/** Every stage's stacks, tagged and checked by the AwsSolutions pack at synth (P08.1). */
export function buildApp(app: App = new App()): App {
  const access = new DeployAccessStack(app, 'Spoh-DeployAccess', {
    env: ACCOUNT_ENV,
    repository: REPOSITORY,
    description: 'GitHub OIDC and the CI deploy role (P08.2)',
  });
  Tags.of(access).add('app', 'spoh-platform');
  for (const stage of Object.values(STAGES)) {
    const stack = new PlatformStack(app, `Spoh-${stage.name}-Platform`, {
      stage,
      env: { account: stage.account, region: stage.region },
      terminationProtection: stage.name === 'prod',
      description: `SPOH platform, ${stage.name} (ADR-008)`,
    });
    tag(stage, stack);
  }
  // A finding fails synth; an accepted one needs a suppression with its reason.
  Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
  return app;
}
