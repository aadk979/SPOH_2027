import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdminCreateUserCommand, AdminGetUserCommand, AdminDisableUserCommand, AdminEnableUserCommand,
  AssociateSoftwareTokenCommand, VerifySoftwareTokenCommand, SetUserMFAPreferenceCommand,
  CognitoIdentityProviderClient, UsernameExistsException, type AdminGetUserCommandOutput,
} from '@aws-sdk/client-cognito-identity-provider';
import { createCognitoIdentityProvider } from '../../src/platform/identity/cognitoIdentityProvider.js';

vi.mock('../../src/config/env.js', () => ({ env: { COGNITO_REGION: 'ap-southeast-1' } }));
const poolId = 'synthetic-pool';
const operationId = '11111111-1111-4111-8111-111111111111';
const input = { email: 'member@example.test', displayName: 'Synthetic Member', role: 'IC' as const, operationId };
const subject = 'synthetic-subject';
function account(overrides: Partial<AdminGetUserCommandOutput> = {}): AdminGetUserCommandOutput {
  return { $metadata: {}, Username: 'synthetic-provider-username', Enabled: true,
    UserStatus: 'FORCE_CHANGE_PASSWORD', UserAttributes: [
      { Name: 'sub', Value: subject }, { Name: 'email', Value: input.email },
      { Name: 'email_verified', Value: 'true' }, { Name: 'name', Value: input.displayName },
      { Name: 'custom:spoh_operation', Value: operationId },
    ], ...overrides };
}
function attribute(name: string, value?: string) {
  const attributes = account().UserAttributes!.filter((item) => item.Name !== name);
  if (value !== undefined) attributes.push({ Name: name, Value: value });
  return account({ UserAttributes: attributes });
}
const exists = () => new UsernameExistsException({ message: 'provider-private-collision', $metadata: {} });
afterEach(() => vi.restoreAllMocks());

describe('durable Cognito account ownership', () => {
  it('suppresses delivery, writes its operation marker and proves the account with bounded post-create read', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send')
      .mockResolvedValueOnce({} as never).mockResolvedValueOnce(account() as never);
    const identity = createCognitoIdentityProvider(poolId);
    expect(identity.poolId).toBe(poolId);
    expect(await identity.ensureUser(input)).toEqual({ sub: subject, created: true, username: 'synthetic-provider-username' });
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual(['AdminCreateUserCommand', 'AdminGetUserCommand']);
    const create = send.mock.calls[0]![0] as AdminCreateUserCommand;
    expect(create).toBeInstanceOf(AdminCreateUserCommand);
    expect(create.input).toEqual({ UserPoolId: poolId, Username: input.email, MessageAction: 'SUPPRESS',
      DesiredDeliveryMediums: ['EMAIL'], UserAttributes: [
        { Name: 'email', Value: input.email }, { Name: 'email_verified', Value: 'true' },
        { Name: 'name', Value: input.displayName }, { Name: 'custom:spoh_operation', Value: operationId },
      ] });
    expect(create.input.ForceAliasCreation).toBeUndefined();
    expect((send.mock.calls[1]![0] as AdminGetUserCommand).input).toEqual({ UserPoolId: poolId, Username: input.email });
    for (const call of send.mock.calls) expect(call[1]).toMatchObject({ abortSignal: expect.any(AbortSignal) });
    expect(timeout.mock.calls).toEqual([[10_000], [10_000]]);
    const client = send.mock.contexts[0] as CognitoIdentityProviderClient;
    expect(await client.config.maxAttempts()).toBe(1);
  });

  it.each(['FORCE_CHANGE_PASSWORD', 'CONFIRMED'] as const)('resumes only its exact earlier %s account after partial failure', async (status) => {
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send')
      .mockRejectedValueOnce(exists()).mockResolvedValueOnce(account({ UserStatus: status }) as never);
    expect(await createCognitoIdentityProvider(poolId).ensureUser(input)).toEqual({
      sub: subject, created: false, username: 'synthetic-provider-username',
    });
    expect(send.mock.calls).toHaveLength(2);
    expect(send.mock.calls[1]![0]).toBeInstanceOf(AdminGetUserCommand);
  });

  it('accepts normalized verified email while preserving exact name and operation identity', async () => {
    vi.spyOn(CognitoIdentityProviderClient.prototype, 'send')
      .mockRejectedValueOnce(exists()).mockResolvedValueOnce(attribute('email', ' MEMBER@EXAMPLE.TEST ') as never);
    expect(await createCognitoIdentityProvider(poolId).ensureUser(input)).toMatchObject({ sub: subject, created: false });
  });

  it.each([
    ['missing marker', attribute('custom:spoh_operation')],
    ['foreign marker', attribute('custom:spoh_operation', '22222222-2222-4222-8222-222222222222')],
    ['missing email', attribute('email')], ['foreign email', attribute('email', 'other@example.test')],
    ['unverified email', attribute('email_verified', 'false')], ['missing verification', attribute('email_verified')],
    ['changed name', attribute('name', 'Other Synthetic Person')], ['missing name', attribute('name')],
    ['missing subject', attribute('sub')], ['empty subject', attribute('sub', '')],
    ['missing username', account({ Username: undefined })], ['empty username', account({ Username: '' })],
    ['disabled account', account({ Enabled: false })], ['missing enabled standing', account({ Enabled: undefined })],
    ['unconfirmed account', account({ UserStatus: 'UNCONFIRMED' })],
    ['password reset account', account({ UserStatus: 'RESET_REQUIRED' })],
    ['missing account status', account({ UserStatus: undefined })],
  ] as const)('refuses an existing account with %s instead of adopting it or sending an invitation', async (_label, user) => {
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send')
      .mockRejectedValueOnce(exists()).mockResolvedValueOnce(user as never);
    const error = await createCognitoIdentityProvider(poolId).ensureUser(input).catch((failure: unknown) => failure);
    expect(error).toMatchObject({ code: 'CONFLICT', statusCode: 409,
      message: 'This identity account cannot be reconciled with the planned operation.' });
    expect(JSON.stringify(error)).not.toMatch(/member@example|synthetic-subject|provider-private-collision/);
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual(['AdminCreateUserCommand', 'AdminGetUserCommand']);
  });

  it('also refuses incomplete proof after a nominally successful creation', async () => {
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send')
      .mockResolvedValueOnce({} as never).mockResolvedValueOnce(attribute('custom:spoh_operation') as never);
    await expect(createCognitoIdentityProvider(poolId).ensureUser(input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('can reconcile its exact account after creation succeeded but its proof read failed', async () => {
    const failure = new Error('provider read unavailable');
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send')
      .mockResolvedValueOnce({} as never).mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(exists()).mockResolvedValueOnce(account() as never);
    const identity = createCognitoIdentityProvider(poolId);
    await expect(identity.ensureUser(input)).rejects.toBe(failure);
    expect(await identity.ensureUser(input)).toEqual({ sub: subject, created: false, username: 'synthetic-provider-username' });
    expect(send.mock.calls.map(([command]) => command.constructor.name))
      .toEqual(['AdminCreateUserCommand', 'AdminGetUserCommand', 'AdminCreateUserCommand', 'AdminGetUserCommand']);
    for (const index of [0, 2]) expect((send.mock.calls[index]![0] as AdminCreateUserCommand).input.MessageAction).toBe('SUPPRESS');
  });

  it.each([undefined, '', 'not-an-operation', '11111111-1111-0111-8111-111111111111',
    '11111111-1111-4111-1111-111111111111'])('refuses invalid/missing durable UUID %s before any provider call', async (id) => {
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send');
    await expect(createCognitoIdentityProvider(poolId).ensureUser({ ...input, operationId: id }))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([new Error('network unavailable'), Object.assign(new Error('not a verified SDK collision'), { name: 'UsernameExistsException' })])(
    'propagates an unrelated create failure without reading or adopting an account', async (failure) => {
      const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockRejectedValue(failure);
      await expect(createCognitoIdentityProvider(poolId).ensureUser(input)).rejects.toBe(failure);
      expect(send).toHaveBeenCalledOnce();
    });
});

describe('subject-proven invitations and MFA', () => {
  it('resends only a pending temporary-password invitation after exact subject/email/standing proof', async () => {
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send')
      .mockResolvedValueOnce(account({ UserStatus: 'CONFIRMED' }) as never)
      .mockResolvedValueOnce(account() as never).mockResolvedValueOnce({} as never);
    const identity = createCognitoIdentityProvider(poolId);
    expect(await identity.resendInvite(input.email, subject)).toBe(false);
    expect(await identity.resendInvite(input.email, subject)).toBe(true);
    expect(send.mock.calls.map(([command]) => command.constructor.name))
      .toEqual(['AdminGetUserCommand', 'AdminGetUserCommand', 'AdminCreateUserCommand']);
    expect((send.mock.calls[2]![0] as AdminCreateUserCommand).input).toEqual({ UserPoolId: poolId,
      Username: 'synthetic-provider-username', MessageAction: 'RESEND', DesiredDeliveryMediums: ['EMAIL'] });
    for (const call of send.mock.calls) expect(call[1]).toMatchObject({ abortSignal: expect.any(AbortSignal) });
  });

  it.each([
    ['missing expected subject', undefined, account()], ['foreign expected subject', 'other-subject', account()],
    ['missing returned subject', subject, attribute('sub')], ['foreign returned subject', subject, attribute('sub', 'other-subject')],
    ['foreign email', subject, attribute('email', 'other@example.test')],
    ['unverified email', subject, attribute('email_verified', 'false')],
    ['missing email verification', subject, attribute('email_verified')],
    ['missing username', subject, account({ Username: undefined })],
    ['empty username', subject, account({ Username: '' })],
    ['unconfirmed status', subject, account({ UserStatus: 'UNCONFIRMED' })],
    ['password reset status', subject, account({ UserStatus: 'RESET_REQUIRED' })],
    ['missing status', subject, account({ UserStatus: undefined })],
  ] as const)('refuses resend, MFA discovery, disable and enable for %s', async (_label, expected, user) => {
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockResolvedValue(user as never);
    const identity = createCognitoIdentityProvider(poolId);
    await expect(identity.resendInvite(input.email, expected)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(identity.hasMfa(input.email, expected)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(identity.disableUser(input.email, expected)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(identity.enableUser(input.email, expected)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(send.mock.calls.map(([command]) => command.constructor.name))
      .toEqual(Array.from({ length: 4 }, () => 'AdminGetUserCommand'));
  });

  it.each([false, undefined])('refuses disabled or unknown-enabled invitation/MFA standing %s', async (enabled) => {
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockResolvedValue(account({ Enabled: enabled }) as never);
    const identity = createCognitoIdentityProvider(poolId);
    await expect(identity.resendInvite(input.email, subject)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(identity.hasMfa(input.email, subject)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual(['AdminGetUserCommand', 'AdminGetUserCommand']);
  });

  it('does not retry an ambiguous RESEND within the adapter or reinterpret it as mailbox delivery', async () => {
    const failure = new Error('delivery outcome unknown');
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send')
      .mockResolvedValueOnce(account() as never).mockRejectedValueOnce(failure);
    await expect(createCognitoIdentityProvider(poolId).resendInvite(input.email, subject)).rejects.toBe(failure);
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual(['AdminGetUserCommand', 'AdminCreateUserCommand']);
    const client = send.mock.contexts[0] as CognitoIdentityProviderClient;
    expect(await client.config.maxAttempts()).toBe(1);
  });

  it.each([undefined, [], ['SMS_MFA'], ['SOFTWARE_TOKEN_MFA']])('discovers only owned TOTP MFA %j', async (settings) => {
    vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockResolvedValue(account({ UserMFASettingList: settings }) as never);
    expect(await createCognitoIdentityProvider(poolId).hasMfa(input.email, subject))
      .toBe(settings?.includes('SOFTWARE_TOKEN_MFA') ?? false);
  });

  it('enrols and enables TOTP with bounded token-scoped calls and no SMS or groups', async () => {
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send')
      .mockResolvedValueOnce({ SecretCode: 'SYNTHETIC-TOTP-SECRET' } as never)
      .mockResolvedValueOnce({ Status: 'SUCCESS' } as never).mockResolvedValueOnce({} as never);
    const identity = createCognitoIdentityProvider(poolId);
    expect(await identity.beginMfa('synthetic-provider-token')).toBe('SYNTHETIC-TOTP-SECRET');
    await identity.verifyMfa({ accessToken: 'synthetic-provider-token', code: '123456' });
    expect(send.mock.calls[0]![0]).toBeInstanceOf(AssociateSoftwareTokenCommand);
    expect((send.mock.calls[1]![0] as VerifySoftwareTokenCommand).input).toEqual({ AccessToken: 'synthetic-provider-token', UserCode: '123456' });
    expect(send.mock.calls[2]![0]).toBeInstanceOf(SetUserMFAPreferenceCommand);
    expect((send.mock.calls[2]![0] as SetUserMFAPreferenceCommand).input).toEqual({ AccessToken: 'synthetic-provider-token',
      SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true } });
    for (const call of send.mock.calls) expect(call[1]).toMatchObject({ abortSignal: expect.any(AbortSignal) });
  });

  it('reports a rejected authenticator code without enabling MFA', async () => {
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockResolvedValue({ Status: 'ERROR' } as never);
    await expect(createCognitoIdentityProvider(poolId).verifyMfa({ accessToken: 'synthetic-provider-token', code: '000000' }))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0]).toBeInstanceOf(VerifySoftwareTokenCommand);
  });

  it('requires an enrollment secret instead of accepting an incomplete provider response', async () => {
    vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockResolvedValue({} as never);
    await expect(createCognitoIdentityProvider(poolId).beginMfa('synthetic-provider-token'))
      .rejects.toMatchObject({ code: 'INTERNAL_ERROR', expose: false });
  });

  it('bounds existing disable and enable operations to the selected pool', async () => {
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send')
      .mockResolvedValueOnce(account() as never).mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce(account({ Enabled: false }) as never).mockResolvedValueOnce({} as never);
    const identity = createCognitoIdentityProvider(poolId);
    await identity.disableUser(input.email, subject);
    await identity.enableUser(input.email, subject);
    expect(send.mock.calls.map(([command]) => command.constructor.name))
      .toEqual(['AdminGetUserCommand', 'AdminDisableUserCommand', 'AdminGetUserCommand', 'AdminEnableUserCommand']);
    expect(send.mock.calls[1]![0]).toBeInstanceOf(AdminDisableUserCommand);
    expect(send.mock.calls[3]![0]).toBeInstanceOf(AdminEnableUserCommand);
    for (const index of [1, 3]) expect((send.mock.calls[index]![0] as AdminDisableUserCommand).input)
      .toEqual({ UserPoolId: poolId, Username: 'synthetic-provider-username' });
    for (const call of send.mock.calls) expect(call[1]).toMatchObject({ abortSignal: expect.any(AbortSignal) });
  });
});
