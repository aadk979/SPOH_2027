import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('P12 identity hardening', () => {
  it('pins the synthetic staging pool and minimum provider lifetimes', () => {
    const app = buildApp(new App());
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
    const prod = Template.fromStack(app.node.findChild('Spoh-prod-Platform') as never);
    expect(prod.findResources('AWS::Cognito::UserPool')).toEqual({});
  });
});
