import { Duration, RemovalPolicy, Stack, Validations } from 'aws-cdk-lib';
import {
  AccountRecovery,
  CfnManagedLoginBranding,
  FeaturePlan,
  ManagedLoginVersion,
  Mfa,
  OAuthScope,
  StandardThreatProtectionMode,
  UserPool,
  UserPoolClient,
  type IUserPool,
} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import type { StageConfig } from './config.js';

export interface CognitoSettings {
  userPoolId: string;
  clientId: string;
  /** The managed login base URL. */
  domain: string;
}

export interface IdentityProps {
  stage: Pick<StageConfig, 'name' | 'identity'>;
  appOrigin: string;
  clientOrigin: string;
}

const COGNITO_ESSENTIALS_REASONS: Record<string, string> = {
  'AwsSolutions-COG2':
    'MFA is optional at the pool; ADR-006 §3 requires it for admin roles in the app (P12), and volunteers sign in on shared phones.',
  'AwsSolutions-COG3':
    'Threat protection is Cognito Plus, a priced option in ADR-008 §6 (budget D-10), enabled only for the owner-approved event month.',
  'AwsSolutions-COG8':
    'Essentials, not Plus, by ADR-008 §1 (budget D-10); Plus is the owner-approved option for the event month (§6).',
};

/**
 * Each stage's own Cognito pool (ADR-006, P12.1). Accounts are made by the roster, never
 * self-signup. Production's pool holds real people: it is retained and deletion-protected,
 * so a stack change can never replace it. The pool referenced before 10 October 2026 was
 * deleted with the rest of AWS (P08 teardown record), so production now owns its pool.
 */
export class PlatformIdentity extends Construct {
  readonly pool: IUserPool;
  readonly settings: CognitoSettings;

  constructor(scope: Construct, id: string, props: IdentityProps) {
    super(scope, id);
    const pool = this.userPool(props);
    const account = Stack.of(this).account;
    const domain = pool.addDomain('HostedUi', {
      cognitoDomain: { domainPrefix: `spoh-${props.stage.name}-${account}` },
      managedLoginVersion: ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });
    const client = this.appClient(pool, props);
    // Managed login needs a style per client; Cognito's own values until the owner brands it.
    new CfnManagedLoginBranding(this, 'Branding', {
      userPoolId: pool.userPoolId,
      clientId: client.userPoolClientId,
      useCognitoProvidedValues: true,
    });
    this.pool = pool;
    this.settings = {
      userPoolId: pool.userPoolId,
      clientId: client.userPoolClientId,
      domain: domain.baseUrl(),
    };
    this.acknowledge(pool, props);
  }

  private userPool({ stage }: IdentityProps): UserPool {
    const plus = stage.identity.plan === 'plus';
    return new UserPool(this, 'Pool', {
      userPoolName: `spoh-${stage.name}`,
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
        tempPasswordValidity: Duration.days(30),
      },
      mfa: Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      featurePlan: plus ? FeaturePlan.PLUS : FeaturePlan.ESSENTIALS,
      ...(plus ? { standardThreatProtectionMode: StandardThreatProtectionMode.FULL_FUNCTION } : {}),
      userInvitation: {
        emailSubject: 'Your event operations account',
        emailBody:
          'You have been invited to the event operations team. Your username is {username} and your temporary password is {####}. Sign in to set your password before training.',
      },
      deletionProtection: stage.identity.retain,
      removalPolicy: stage.identity.retain ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
  }

  private appClient(pool: UserPool, props: IdentityProps): UserPoolClient {
    return new UserPoolClient(this, 'Client', {
      userPool: pool,
      generateSecret: false,
      authFlows: {},
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE, OAuthScope.COGNITO_ADMIN],
        callbackUrls: [`${props.appOrigin}/api/v1/auth/callback`],
        logoutUrls: [`${props.clientOrigin}/sign-in`],
      },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.minutes(5),
      idTokenValidity: Duration.minutes(5),
      refreshTokenValidity: Duration.minutes(60),
    });
  }

  private acknowledge(pool: UserPool, { stage }: IdentityProps): void {
    for (const [ruleId, reason] of Object.entries(COGNITO_ESSENTIALS_REASONS)) {
      // On Plus the threat-protection findings no longer apply; MFA stays an app rule.
      if (stage.identity.plan === 'plus' && ruleId !== 'AwsSolutions-COG2') continue;
      Validations.of(pool).acknowledge({ id: ruleId, reason });
    }
  }
}
