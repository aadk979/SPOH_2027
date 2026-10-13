import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { StageConfig } from './config.js';
import { NetworkDatabase } from './networkDatabase.js';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { AppSecrets } from './appSecrets.js';
import { AppService, createHttpApi } from './appService.js';
import { IMAGE_REPOSITORY } from './deployAccessStack.js';
import { PlatformIdentity, type CognitoSettings } from './identity.js';
import { DatabaseCpuMonitoring } from './databaseCpuMonitoring.js';
import { ObjectStorage } from './objectStorage.js';
import { AuthorizationStore } from './authorizationStore.js';
import { OperationsMonitoring } from './operationsMonitoring.js';
import { StagingPermissionMatrixAccess } from './stagingPermissionMatrixAccess.js';

export interface PlatformStackProps extends StackProps {
  stage: StageConfig;
  githubOidcProviderArn: string;
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
    const storage = new ObjectStorage(this, 'Storage', props.stage);
    this.network = new NetworkDatabase(this, 'Data', props.stage);
    new CfnOutput(this, 'DatabaseIdentifier', { value: this.network.database.instanceIdentifier });
    new DatabaseCpuMonitoring(this, 'DatabaseMonitoring', {
      stage: props.stage.name,
      database: this.network.database,
    });
    const secrets = new AppSecrets(this, 'Secrets', `spoh/${props.stage.name}`);
    const authorization = new AuthorizationStore(this, 'Authorization', {
      stage: props.stage.name,
    });
    if (props.stage.name === 'staging') new StagingPermissionMatrixAccess(this, 'PermissionMatrixAccess', {
      providerArn: props.githubOidcProviderArn, authorization,
    });
    const api = createHttpApi(this, props.stage);
    const cognito = this.cognito(props.stage, api.apiEndpoint);

    // A release: `-c imageTag=<commit>` defines the migrate task for it, and
    // `-c serviceImageTag=<commit>` moves the service once migrations have run.
    const imageTag = this.node.tryGetContext('imageTag') as string | undefined;
    const serviceImageTag = this.node.tryGetContext('serviceImageTag') as string | undefined;
    let app: AppService | undefined;
    if (imageTag) {
      app = new AppService(this, 'App', {
        stage: props.stage,
        data: this.network,
        secrets,
        repository: Repository.fromRepositoryName(this, 'Images', IMAGE_REPOSITORY),
        imageTag,
        ...(serviceImageTag ? { serviceImageTag } : {}),
        api,
        cognito,
        authorization,
        exportsBucket: storage.exports,
        ...(props.stage.publicOrigins
          ? { mediaBucket: storage.media, contentBucket: storage.content }
          : {}),
      });
    }
    new OperationsMonitoring(this, 'Operations', {
      stage: props.stage.name,
      database: this.network.database,
      ...(app?.service ? { service: app.service } : {}),
    });
    if (app?.service) new CfnOutput(this, 'ServiceName', { value: app.service.serviceName });
  }

  /** Each stage owns its pool; production's is retained and deletion-protected (P12.1). */
  private cognito(stage: StageConfig, appOrigin: string): CognitoSettings {
    return new PlatformIdentity(this, 'Identity', {
      stage,
      appOrigin: stage.publicOrigins?.api ?? appOrigin,
      clientOrigin: stage.publicOrigins?.client ?? appOrigin,
    }).settings;
  }
}
