import type { ClientConfiguration } from '@spoh/shared';

/** Hand validation keeps Zod off every route (F03-037). Mirrors the public contract. */
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid configuration');
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error('Invalid configuration');
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.length || value.length > max)
    throw new Error('Invalid configuration');
  return value;
}

function origin(value: unknown, allowEmpty = false): string {
  if (allowEmpty && value === '') return '';
  const address = text(value, 2048);
  const url = new URL(address);
  if (!/^https?:\/\/[^/?#\s@\\]+$/.test(address) || url.origin !== address)
    throw new Error('Invalid configuration');
  return address;
}

/** Explicit provider, exact public fields, complete cloud metadata, no auth defaults. */
export function readClientEnv(raw: unknown): ClientConfiguration {
  const value = record(raw, ['version', 'apiBaseUrl', 'envLabel', 'authProvider', 'cognito', 'mediaOrigin']);
  if (value.version !== 2) throw new Error('Invalid configuration');
  const label = text(value.envLabel, 32);
  if (!['development', 'test', 'staging', 'production'].includes(label))
    throw new Error('Invalid configuration');
  const common = {
    version: 2 as const,
    apiBaseUrl: origin(value.apiBaseUrl, true),
    envLabel: label as ClientConfiguration['envLabel'],
    mediaOrigin: mediaOrigin(value.mediaOrigin),
  };
  const cloudEnvironment = label === 'production' || label === 'staging';
  if (value.authProvider === 'local' && value.cognito === null && !cloudEnvironment)
    return Object.freeze({ ...common, authProvider: 'local', cognito: null });
  if (value.authProvider !== 'cognito') throw new Error('Invalid configuration');
  const cloud = record(value.cognito, ['region', 'userPoolId', 'clientId', 'domain']);
  const cognito = Object.freeze({
    region: text(cloud.region, 64),
    userPoolId: text(cloud.userPoolId, 128),
    clientId: text(cloud.clientId, 128),
    domain: origin(cloud.domain),
  });
  if (cloudEnvironment) requireCloudOrigins(common.apiBaseUrl, cognito.domain);
  return Object.freeze({ ...common, authProvider: 'cognito', cognito });
}

function requireCloudOrigins(apiBaseUrl: string, domain: string): void {
  if (!apiBaseUrl.startsWith('https://') || !domain.startsWith('https://'))
    throw new Error('Invalid configuration');
}

function mediaOrigin(value: unknown): string | null {
  if (value === null) return null;
  const address = text(value, 2048);
  if (!/^https:\/\/[a-z0-9][a-z0-9-]{1,61}[a-z0-9]\.s3\.(?!cn-)[a-z]{2}-(?:[a-z]+-)+[1-9]\d*\.amazonaws\.com$/.test(address))
    throw new Error('Invalid configuration');
  return address;
}
