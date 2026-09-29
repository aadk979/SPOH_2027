import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { StageConfig } from './config.js';

export interface PlatformStackProps extends StackProps {
  stage: StageConfig;
}

/**
 * One environment's platform (ADR-008 §1). P08.1 is the skeleton: the stack,
 * its environment and tags. P08.3–P08.8 add the network and database, the
 * container service, the edge, secrets, storage and alarms as constructs here.
 */
export class PlatformStack extends Stack {
  readonly stage: StageConfig;

  constructor(scope: Construct, id: string, props: PlatformStackProps) {
    super(scope, id, props);
    this.stage = props.stage;
  }
}
