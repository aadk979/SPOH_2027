import { CfnOutput, CfnParameter, Stack } from 'aws-cdk-lib';
import { Secret as EcsSecret } from 'aws-cdk-lib/aws-ecs';
import type { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import type { StageName } from './config.js';

export const VERSION_ID_PATTERN = '^[A-Za-z0-9-]{32,64}$';
export interface SessionSigningVersions { readonly current: string; readonly previous?: string }

function configured(scope: Construct, stage: StageName): SessionSigningVersions | undefined {
  const context: unknown = scope.node.tryGetContext('sessionSigningVersions');
  if (context === undefined) return;
  const parsed: unknown = typeof context === 'string' ? JSON.parse(context) : context;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid session signing version context');
  const stages = parsed as Record<string, unknown>;
  if (Object.keys(stages).some((name) => name !== 'staging' && name !== 'prod')) throw new Error('Invalid session signing version stage');
  const value = stages[stage];
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid session signing version selectors');
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).some((name) => name !== 'current' && name !== 'previous')) throw new Error('Unsupported session signing version selector');
  if (typeof fields.current !== 'string' || !new RegExp(VERSION_ID_PATTERN).test(fields.current)) throw new Error('Explicit current session VersionId is required');
  if (fields.previous !== undefined && (typeof fields.previous !== 'string' || !new RegExp(VERSION_ID_PATTERN).test(fields.previous))) throw new Error('Invalid previous session VersionId');
  if (fields.current === fields.previous) throw new Error('Session signing VersionIds must differ');
  return { current: fields.current, ...(typeof fields.previous === 'string' ? { previous: fields.previous } : {}) };
}

/** An initial service deployment must provide a concrete version; never implicit AWSCURRENT. */
export function sessionSigningInjections(scope: Construct, input: { stage: StageName; secret: ISecret }) {
  const stack = Stack.of(scope);
  const versions: SessionSigningVersions = configured(scope, input.stage) ?? { current: new CfnParameter(stack, 'SessionSigningCurrentVersionId', {
    type: 'String', allowedPattern: VERSION_ID_PATTERN,
    description: 'Explicit VersionId of this stage session secret; obtain after bootstrap, before enabling app tasks.',
  }).valueAsString };
  new CfnOutput(stack, 'SessionSigningCurrentVersionIdOutput', { value: versions.current });
  new CfnOutput(stack, 'SessionSigningPreviousVersionIdOutput', { value: versions.previous ?? '' });
  return {
    SESSION_SIGNING_SECRET: EcsSecret.fromSecretsManagerVersion(input.secret, { versionId: versions.current }),
    ...(versions.previous ? { SESSION_SIGNING_SECRET_PREVIOUS:
      EcsSecret.fromSecretsManagerVersion(input.secret, { versionId: versions.previous }) } : {}),
  };
}
