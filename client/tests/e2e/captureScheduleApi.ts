import { expect, request, type APIRequestContext } from '@playwright/test';
import { SessionResponse } from '@spoh/shared';

/** A separate cookie family avoids racing the UI's short-lived fixture session. */
export async function localCaptureScheduleApi(origin: string) {
  const url = new URL(origin);
  if (url.hostname !== 'localhost' || url.port !== '4012')
    throw new Error('Dedicated local fixture API required');
  const context = await request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: 'http://localhost:3001' },
  });
  const opened = await context.post('/api/v1/auth/session', {
    data: { email: 'admin@spoh2027.test' },
  });
  expect(opened.status()).toBe(201);
  let session = SessionResponse.parse(await opened.json());
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
  return {
    get: async (path: string, options?: Parameters<APIRequestContext['get']>[1]) =>
      context.get(path, { ...options, headers: { ...options?.headers, ...(await headers()) } }),
    post: async (path: string, options?: Parameters<APIRequestContext['post']>[1]) =>
      context.post(path, { ...options, headers: { ...options?.headers, ...(await headers()) } }),
    dispose: async () => {
      try {
        expect((await context.delete('/api/v1/auth/session')).status()).toBe(204);
      } finally {
        await context.dispose();
      }
    },
  };
}
