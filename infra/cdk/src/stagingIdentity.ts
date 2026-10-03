import { RemovalPolicy, Stack, Validations } from 'aws-cdk-lib';
import {
  AccountRecovery,
  Mfa,
  OAuthScope,
  UserPool,
  UserPoolClient,
  type IUserPool,
} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface CognitoSettings {
  userPoolId: string;
  clientId: string;
  /** The Hosted UI base URL. */
  domain: string;
}

/**
 * Staging's own Cognito pool (ADR-006 §1, P08.5 step 4): staging never holds
 * real people, so it never touches the production pool. Accounts are made by
 * the roster, never self-signup, as in production.
 */
export class StagingIdentity extends Construct {
  readonly pool: IUserPool;
  readonly settings: CognitoSettings;

  constructor(
    scope: Construct,
    id: string,
    props: { appOrigin: string; clientOrigin: string; stageName: string },
  ) {
    super(scope, id);
    const pool = new UserPool(this, 'Pool', {
      userPoolName: `spoh-${props.stageName}`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      passwordPolicy: {
        minLength: 12,
        requireSymbols: true,
        requireDigits: true,
        requireUppercase: true,
        requireLowercase: true,
      },
      mfa: Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const account = Stack.of(this).account;
    const domain = pool.addDomain('HostedUi', {
      cognitoDomain: { domainPrefix: `spoh-${props.stageName}-${account}` },
    });
    const client = new UserPoolClient(this, 'Client', {
      userPool: pool,
      generateSecret: false,
      authFlows: {},
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: [`${props.appOrigin}/api/v1/auth/callback`],
        logoutUrls: [`${props.clientOrigin}/sign-in`],
      },
      preventUserExistenceErrors: true,
    });
    this.pool = pool;
    this.settings = {
      userPoolId: pool.userPoolId,
      clientId: client.userPoolClientId,
      domain: domain.baseUrl(),
    };
    const reasons: Record<string, string> = {
      'AwsSolutions-COG2':
        'MFA is optional at the pool; ADR-006 §3 requires it for admin roles in the app (P12), and volunteers sign in on shared phones.',
      'AwsSolutions-COG3':
        'Threat protection is Cognito Plus, a priced option in ADR-008 §6 (budget D-10); staging holds synthetic accounts only.',
      'AwsSolutions-COG8':
        'Essentials, not Plus, by ADR-008 §1 (budget D-10); Plus is a priced option for production (§6).',
    };
    for (const [ruleId, reason] of Object.entries(reasons)) {
      Validations.of(pool).acknowledge({ id: ruleId, reason });
    }
  }
}
