import { AdminGetUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import type { AdminGetUserCommandOutput } from '@aws-sdk/client-cognito-identity-provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootstrapAdminConfiguration, verifyBootstrapIdentity } from '../../prisma/bootstrapAdmin.js';

const source = {
  SPOH_SKIP_DOTENV: '1', DATABASE_URL: 'postgresql://spoh:spoh@localhost:5435/spoh2027_test',
  SEED_ADMIN_ORGANISATION_ID: 'synthetic-org', SEED_ADMIN_EMAIL: 'Admin@example.test',
  SEED_ADMIN_NAME: 'Synthetic Administrator', SEED_ADMIN_SUB: '11111111-1111-4111-8111-111111111111',
  COGNITO_USER_POOL_ID: 'ap-southeast-1_synthetic', COGNITO_REGION: 'ap-southeast-1',
  SEED_BOOTSTRAP_OWNER_APPROVAL_REFERENCE: 'synthetic-owner-reference',
};
const input = bootstrapAdminConfiguration(source);
const attributes = { sub: input.subject, email: input.email, email_verified: 'true', name: input.displayName };
function account(override: Partial<AdminGetUserCommandOutput> = {}): AdminGetUserCommandOutput {
  return { $metadata: {}, Username: 'provider-username', Enabled: true, UserStatus: 'CONFIRMED',
    UserAttributes: Object.entries(attributes).map(([Name, Value]) => ({ Name, Value })), ...override };
}
afterEach(() => vi.restoreAllMocks());

describe('explicit production bootstrap configuration', () => {
  it('normalises email without selecting an organisation or local identity', () => {
    expect(input).toMatchObject({ organisationId: 'synthetic-org', email: 'admin@example.test', subject: source.SEED_ADMIN_SUB });
  });
  it.each(Object.keys(source))('requires explicit %s', (key) => {
    expect(() => bootstrapAdminConfiguration({ ...source, [key]: '' })).toThrow(/requires|invalid/);
  });
  it.each([
    { SPOH_SKIP_DOTENV: '0' }, { SEED_ADMIN_EMAIL: 'invalid' }, { SEED_ADMIN_SUB: 'local:synthetic' },
    { COGNITO_REGION: 'eu-west-1' }, { COGNITO_USER_POOL_ID: 'https://untrusted.test/pool' },
    { SEED_BOOTSTRAP_OWNER_APPROVAL_REFERENCE: ' '.repeat(10) },
  ])('refuses invalid explicit inputs %j without disclosing them', (overrides) => {
    expect(() => bootstrapAdminConfiguration({ ...source, ...overrides })).toThrow(/requires|invalid/);
  });
});

describe('exact bounded provider proof for initial bootstrap', () => {
  it.each(['CONFIRMED', 'FORCE_CHANGE_PASSWORD'] as const)('accepts an enabled verified %s account', async (UserStatus) => {
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockResolvedValue(account({ UserStatus }) as never);
    const destroy = vi.spyOn(CognitoIdentityProviderClient.prototype, 'destroy');
    await verifyBootstrapIdentity(input);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0]).toBeInstanceOf(AdminGetUserCommand);
    expect((send.mock.calls[0]![0] as AdminGetUserCommand).input).toEqual({ UserPoolId: input.userPoolId, Username: input.email });
    expect(send.mock.calls[0]![1]).toMatchObject({ abortSignal: expect.any(AbortSignal) });
    expect(destroy).toHaveBeenCalledOnce();
  });
  it.each([{ Username: undefined }, { Enabled: false }, { UserStatus: 'UNCONFIRMED' as const },
    { UserStatus: 'RESET_REQUIRED' as const }, { UserAttributes: [] }])('refuses incomplete or inactive proof %j', async (override) => {
    vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockResolvedValue(account(override) as never);
    await expect(verifyBootstrapIdentity(input)).rejects.toThrow('Bootstrap identity proof did not match.');
  });
  it.each(Object.keys(attributes))('refuses mismatched %s', async (attribute) => {
    const UserAttributes = Object.entries(attributes).map(([Name, Value]) => ({ Name,
      Value: Name === attribute ? 'mismatched-proof' : Value }));
    vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockResolvedValue(account({ UserAttributes }) as never);
    await expect(verifyBootstrapIdentity(input)).rejects.toThrow('Bootstrap identity proof did not match.');
  });
  it('destroys the SDK client when provider evidence cannot be obtained', async () => {
    vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockRejectedValue(new Error('synthetic provider outage'));
    const destroy = vi.spyOn(CognitoIdentityProviderClient.prototype, 'destroy');
    await expect(verifyBootstrapIdentity(input)).rejects.toThrow('synthetic provider outage');
    expect(destroy).toHaveBeenCalledOnce();
  });
});
