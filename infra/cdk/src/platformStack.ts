import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { StageConfig } from './config.js';
import { NetworkDatabase } from './networkDatabase.js';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { AppSecrets } from './appSecrets.js';
import { AppService, createHttpApi } from './appService.js';
import { IMAGE_REPOSITORY } from './deployAccessStack.js';
import { StagingIdentity, type CognitoSettings } from './stagingIdentity.js';
import { DatabaseCpuMonitoring } from './databaseCpuMonitoring.js';

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
    new DatabaseCpuMonitoring(this, 'DatabaseMonitoring', {
      stage: props.stage.name,
      database: this.network.database,
    });
    const secrets = new AppSecrets(this, 'Secrets', `spoh/${props.stage.name}`);
    const api = createHttpApi(this, props.stage);
    const cognito = this.cognito(props.stage, api.apiEndpoint);

    // A release: `-c imageTag=<commit>` defines the migrate task for it, and
    // `-c serviceImageTag=<commit>` moves the service once migrations have run.
    const imageTag = this.node.tryGetContext('imageTag') as string | undefined;
    const serviceImageTag = this.node.tryGetContext('serviceImageTag') as string | undefined;
    if (imageTag) {
      new AppService(this, 'App', {
        stage: props.stage,
        data: this.network,
        secrets,
        repository: Repository.fromRepositoryName(this, 'Images', IMAGE_REPOSITORY),
        imageTag,
        ...(serviceImageTag ? { serviceImageTag } : {}),
        api,
        cognito,
      });
    }
  }

  /** Staging gets its own pool; production references the existing one by id. */
  private cognito(stage: StageConfig, appOrigin: string): CognitoSettings {
    if (stage.existingCognito) return stage.existingCognito;
    return new StagingIdentity(this, 'Identity', { appOrigin, stageName: stage.name }).settings;
  }
}
