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
  const value = record(raw, ['version', 'apiBaseUrl', 'envLabel', 'authProvider', 'cognito']);
  if (value.version !== 1) throw new Error('Invalid configuration');
  const label = text(value.envLabel, 32);
  if (!['development', 'test', 'staging', 'production'].includes(label))
    throw new Error('Invalid configuration');
  const common = {
    version: 1 as const,
    apiBaseUrl: origin(value.apiBaseUrl, true),
    envLabel: label as ClientConfiguration['envLabel'],
  };
  if (value.authProvider === 'local' && value.cognito === null)
    return Object.freeze({ ...common, authProvider: 'local', cognito: null });
  if (value.authProvider !== 'cognito') throw new Error('Invalid configuration');
  const cloud = record(value.cognito, ['region', 'userPoolId', 'clientId', 'domain']);
  const cognito = Object.freeze({
    region: text(cloud.region, 64),
    userPoolId: text(cloud.userPoolId, 128),
    clientId: text(cloud.clientId, 128),
    domain: origin(cloud.domain),
  });
  return Object.freeze({ ...common, authProvider: 'cognito', cognito });
}
