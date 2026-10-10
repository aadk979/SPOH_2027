import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminCreateUserCommand, CognitoIdentityProviderClient, UsernameExistsException } from '@aws-sdk/client-cognito-identity-provider';
import { createCognitoIdentityProvider } from '../../src/platform/identity/cognitoIdentityProvider.js';

afterEach(() => vi.restoreAllMocks());
describe('Cognito identity lifecycle (no role groups)', () => {
  it('creates an emailed invite without assigning an authorization group', async () => {
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockResolvedValue({ User: { Attributes: [{ Name: 'sub', Value: 'subject' }] } } as never);
    const identity = createCognitoIdentityProvider('synthetic-pool');
    expect(await identity.ensureUser({ email: 'member@example.test', displayName: 'Member', role: 'IC' })).toEqual({ sub: 'subject', created: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(AdminCreateUserCommand);
  });
  it('reuses an account minted by an earlier partially failed import', async () => {
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send')
      .mockRejectedValueOnce(new UsernameExistsException({ message: 'exists', $metadata: {} }))
      .mockResolvedValueOnce({ UserAttributes: [{ Name: 'sub', Value: 'existing-subject' }] } as never);
    expect(await createCognitoIdentityProvider('synthetic-pool').ensureUser({ email: 'member@example.test', displayName: 'Member', role: 'VOLUNTEER' }))
      .toEqual({ sub: 'existing-subject', created: false });
    expect(send.mock.calls[1]?.[0].constructor.name).toBe('AdminGetUserCommand');
  });
  it('resends only a pending temporary-password invite', async () => {
    const send = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send')
      .mockResolvedValueOnce({ UserStatus: 'CONFIRMED' } as never)
      .mockResolvedValueOnce({ UserStatus: 'FORCE_CHANGE_PASSWORD' } as never)
      .mockResolvedValueOnce({} as never);
    const identity = createCognitoIdentityProvider('synthetic-pool');
    expect(await identity.resendInvite('confirmed@example.test')).toBe(false);
    expect(await identity.resendInvite('pending@example.test')).toBe(true);
    expect((send.mock.calls[2]?.[0] as AdminCreateUserCommand).input.MessageAction).toBe('RESEND');
  });
  it('checks, enrols and enables TOTP without SMS', async () => {
    vi.spyOn(CognitoIdentityProviderClient.prototype, 'send')
      .mockResolvedValueOnce({ UserMFASettingList: ['SOFTWARE_TOKEN_MFA'] } as never)
      .mockResolvedValueOnce({ SecretCode: 'TOTPSECRET' } as never)
      .mockResolvedValueOnce({ Status: 'SUCCESS' } as never)
      .mockResolvedValueOnce({} as never);
    const identity = createCognitoIdentityProvider('synthetic-pool');
    expect(await identity.hasMfa('admin@example.test')).toBe(true);
    expect(await identity.beginMfa('provider-token')).toBe('TOTPSECRET');
    await identity.verifyMfa({ accessToken: 'provider-token', code: '123456' });
  });
  it('reports an invalid authenticator code as a fixable validation error', async () => {
    vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockResolvedValue({ Status: 'ERROR' } as never);
    await expect(createCognitoIdentityProvider('synthetic-pool').verifyMfa({ accessToken: 'provider-token', code: '000000' }))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
