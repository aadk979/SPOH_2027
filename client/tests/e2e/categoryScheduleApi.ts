import { expect, request, type APIRequestContext } from '@playwright/test';
import { SessionResponse } from '@spoh/shared';

export function categoryScheduleOrigins(clientOrigin: string) {
  const configured = process.env.E2E_API_ORIGIN;
  if (!configured) throw new Error('Explicit E2E_API_ORIGIN is required');
  const api = new URL(configured);
  const client = new URL(clientOrigin);
  if (
    api.protocol !== 'http:' ||
    api.hostname !== 'localhost' ||
    !['4012', '4014'].includes(api.port) ||
    api.origin !== configured ||
    client.protocol !== 'http:' ||
    client.hostname !== 'localhost' ||
    (!['3001', '3002'].includes(client.port) && client.origin !== api.origin) ||
    client.origin !== clientOrigin
  )
    throw new Error('Dedicated local category scheduling origins required');
  return { apiOrigin: api.origin, clientOrigin: client.origin };
}

/** An independent cookie family prevents API polling from racing the UI refresh. */
export async function localCategoryScheduleApi(input: {
  clientOrigin: string;
  email: 'admin@spoh2027.test' | 'booth@spoh2027.test';
}) {
  const origins = categoryScheduleOrigins(input.clientOrigin);
  if (!['admin@spoh2027.test', 'booth@spoh2027.test'].includes(input.email))
    throw new Error('Only the owned category fixture identities may sign in');
  const context = await request.newContext({
    baseURL: origins.apiOrigin,
    extraHTTPHeaders: { Origin: origins.clientOrigin },
    maxRedirects: 0,
  });
  let session: SessionResponse;
  try {
    const opened = await context.post('/api/v1/auth/session', { data: { email: input.email } });
    expect(opened.status()).toBe(201);
    session = SessionResponse.parse(await opened.json());
  } catch (error) {
    await context.dispose();
    throw error;
  }
  let issuedAt = Date.now();
  async function headers() {
    if (Date.now() - issuedAt >= session.expiresIn * 750) {
      const renewed = await context.post('/api/v1/auth/refresh');
      expect(renewed.status()).toBe(200);
      session = SessionResponse.parse(await renewed.json());
      issuedAt = Date.now();
    }
    return { Authorization: `Bearer ${session.accessToken}` };
  }
  function path(value: string) {
    const target = new URL(value, origins.apiOrigin);
    if (target.origin !== origins.apiOrigin || target.username || target.password)
      throw new Error('Only the dedicated category fixture API may be called');
    return target.href;
  }
  return {
    get: async (value: string, options?: Parameters<APIRequestContext['get']>[1]) =>
      context.get(path(value), {
        ...options,
        headers: { ...options?.headers, ...(await headers()) },
      }),
    post: async (value: string, options?: Parameters<APIRequestContext['post']>[1]) =>
      context.post(path(value), {
        ...options,
        headers: { ...options?.headers, ...(await headers()) },
      }),
    dispose: async () => {
      try {
        expect((await context.delete('/api/v1/auth/session')).status()).toBe(204);
      } finally {
        await context.dispose();
      }
    },
  };
}
