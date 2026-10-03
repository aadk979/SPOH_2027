import type { ClientConfiguration } from '@spoh/shared';
import { readClientEnv } from './clientConfigValidation';
export { readClientEnv } from './clientConfigValidation';
export type ClientEnv = ClientConfiguration;

export class ClientConfigurationError extends Error {
  constructor(cause?: unknown) {
    super('Application configuration is unavailable.', { cause });
    this.name = 'ClientConfigurationError';
  }
}

let configuration: ClientEnv | null = null;
let pending: Promise<ClientEnv> | null = null;

/** Consumers may read only the immutable configuration accepted during startup. */
export function getClientEnv(): ClientEnv {
  if (!configuration) throw new ClientConfigurationError();
  return configuration;
}

async function fetchConfiguration(): Promise<ClientEnv> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch('/api/v1/client-config', {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Configuration request failed');
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      throw new Error('Invalid configuration response');
    const value = readClientEnv((payload as { data?: unknown }).data);
    configuration = value;
    return value;
  } catch (cause) {
    throw new ClientConfigurationError(cause);
  } finally {
    clearTimeout(timeout);
  }
}

/** One bootstrap request; failed attempts can retry, accepted configuration stays fixed. */
export function loadClientConfiguration(): Promise<ClientEnv> {
  if (configuration) return Promise.resolve(configuration);
  pending ??= fetchConfiguration().finally(() => {
    pending = null;
  });
  return pending;
}

/** Missing Cognito metadata never selects local authentication. */
export function isDevAuth(): boolean {
  return getClientEnv().authProvider === 'local';
}
