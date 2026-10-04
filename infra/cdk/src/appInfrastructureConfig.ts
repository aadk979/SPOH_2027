import { RemovalPolicy } from 'aws-cdk-lib';
import { Secret as EcsSecret } from 'aws-cdk-lib/aws-ecs';
import { ParameterTier, StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import type { StageConfig } from './config.js';
import type { CognitoSettings } from './stagingIdentity.js';

interface InfrastructureProps {
  stage: StageConfig;
  databaseHost: string;
  appOrigin: string;
  cognito: CognitoSettings;
  port: number;
  mediaBucketName?: string;
}

/** Infrastructure only: operational choices belong to the live settings registry (P10.4). */
function infrastructureValues(props: InfrastructureProps) {
  const { stage, databaseHost, appOrigin, cognito } = props;
  return {
    NODE_ENV: 'production',
    PORT: String(props.port),
    LOG_LEVEL: 'info',
    DB_HOST: databaseHost,
    DB_NAME: 'spoh',
    AUTH_PROVIDER: 'cognito',
    COGNITO_REGION: stage.region,
    COGNITO_USER_POOL_ID: cognito.userPoolId,
    COGNITO_CLIENT_ID: cognito.clientId,
    COGNITO_DOMAIN: cognito.domain,
    APP_BASE_URL: stage.publicOrigins?.api ?? appOrigin,
    CORS_ALLOWED_ORIGINS: stage.publicOrigins?.client ?? appOrigin,
    ...(stage.publicOrigins
      ? {
          CLIENT_BASE_URL: stage.publicOrigins.client,
          DEPLOYMENT_ENV: stage.name === 'prod' ? 'production' : 'staging',
        }
      : {}),
    // Trust the closest API Gateway hop; the native endpoint remains reachable directly.
    TRUST_PROXY_HOPS: '1',
    AWS_REGION: stage.region,
    ...(props.mediaBucketName ? { S3_MEDIA_BUCKET: props.mediaBucketName } : {}),
  };
}

/** ECS resolves standard, non-secret parameters at task start using its execution role. */
export class AppInfrastructureConfig extends Construct {
  readonly appInjections: Record<string, EcsSecret>;
  readonly migrationInjections: Record<string, EcsSecret>;

  constructor(scope: Construct, id: string, props: InfrastructureProps) {
    super(scope, id);
    this.appInjections = Object.fromEntries(
      Object.entries(infrastructureValues(props)).map(([name, value]) => {
        const parameter = new StringParameter(this, name, {
          parameterName: `/spoh/${props.stage.name}/infra/${name}`,
          description: `${props.stage.name} container infrastructure: ${name}`,
          stringValue: value,
          tier: ParameterTier.STANDARD,
        });
        parameter.applyRemovalPolicy(
          props.stage.name === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
        );
        return [name, EcsSecret.fromSsmParameter(parameter)];
      }),
    );
    this.migrationInjections = Object.fromEntries(
      Object.entries(this.appInjections).filter(
        ([name]) => name === 'DB_HOST' || name === 'DB_NAME',
      ),
    );
  }
}
