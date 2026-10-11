import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';
import { buildApp } from '../src/app.js';

// One synthesis for the default plan: each one takes seconds.
const app = buildApp(new App());

describe('P12 identity hardening', () => {
  it('pins the synthetic staging pool and minimum provider lifetimes', () => {
    const template = Template.fromStack(app.node.findChild('Spoh-staging-Platform') as never);
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      MfaConfiguration: 'OPTIONAL', EnabledMfas: ['SOFTWARE_TOKEN_MFA'], UserPoolTier: 'ESSENTIALS',
      Policies: { PasswordPolicy: { MinimumLength: 12, RequireLowercase: true, RequireNumbers: true, TemporaryPasswordValidityDays: 30 } },
    });
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      AccessTokenValidity: 5, IdTokenValidity: 5, RefreshTokenValidity: 60,
      TokenValidityUnits: { AccessToken: 'minutes', IdToken: 'minutes', RefreshToken: 'minutes' },
      EnableTokenRevocation: true, PreventUserExistenceErrors: 'ENABLED',
      AllowedOAuthFlows: ['code'], AllowedOAuthScopes: ['openid', 'email', 'profile', 'aws.cognito.signin.user.admin'],
    });
  });

  it('retains and deletion-protects the production pool, and lets staging go with its stack', () => {
    const prod = Template.fromStack(app.node.findChild('Spoh-prod-Platform') as never);
    prod.hasResource('AWS::Cognito::UserPool', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: { DeletionProtection: 'ACTIVE', UserPoolTier: 'ESSENTIALS' },
    });
    const staging = Template.fromStack(app.node.findChild('Spoh-staging-Platform') as never);
    staging.hasResource('AWS::Cognito::UserPool', {
      DeletionPolicy: 'Delete',
      Properties: { DeletionProtection: 'INACTIVE' },
    });
  });

  it('serves managed login with a branding style bound to the app client', () => {
    for (const stage of ['staging', 'prod']) {
      const template = Template.fromStack(app.node.findChild(`Spoh-${stage}-Platform`) as never);
      template.hasResourceProperties('AWS::Cognito::UserPoolDomain', { ManagedLoginVersion: 2 });
      const client = Object.keys(template.findResources('AWS::Cognito::UserPoolClient'))[0]!;
      template.hasResourceProperties('AWS::Cognito::ManagedLoginBranding', {
        ClientId: { Ref: client },
        UseCognitoProvidedValues: true,
      });
    }
  });

  it('switches on threat protection with the Plus plan for the event month', () => {
    const plus = buildApp(new App({ context: { cognitoPlan: 'plus' } }));
    const prod = Template.fromStack(plus.node.findChild('Spoh-prod-Platform') as never);
    prod.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolTier: 'PLUS',
      UserPoolAddOns: { AdvancedSecurityMode: 'ENFORCED' },
    });
  });
});
