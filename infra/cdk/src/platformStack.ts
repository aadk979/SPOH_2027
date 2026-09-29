import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { StageConfig } from './config.js';
import { NetworkDatabase } from './networkDatabase.js';

export interface PlatformStackProps extends StackProps {
  stage: StageConfig;
}

/**
 * One environment's platform (ADR-008 §1): the network and database (P08.3),
 * then the container service, the edge, secrets, storage and alarms as
 * constructs here (P08.4–P08.8).
 */
export class PlatformStack extends Stack {
  readonly stage: StageConfig;
  readonly network: NetworkDatabase;

  constructor(scope: Construct, id: string, props: PlatformStackProps) {
    super(scope, id, props);
    this.stage = props.stage;
    this.network = new NetworkDatabase(this, 'Data', props.stage);
  }
}
