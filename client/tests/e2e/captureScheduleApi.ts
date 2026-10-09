import { expect, request, type APIRequestContext, type APIResponse } from '@playwright/test';
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
  /**
   * The fixture API shares the admin's rate limit with the screen under test. A 429 waits out
   * the window it names and retries, so a busy minute cannot leave a fixture half cleaned up
   * (capture paused for every test after it).
   */
  async function patiently(send: () => Promise<APIResponse>): Promise<APIResponse> {
    for (let attempt = 0; ; attempt++) {
      const response = await send();
      if (response.status() !== 429 || attempt === 2) return response;
      const seconds = Number(response.headers()['retry-after'] ?? 30);
      await new Promise((resolve) => setTimeout(resolve, Math.min(seconds, 65) * 1000 + 250));
    }
  }
  return {
    get: async (path: string, options?: Parameters<APIRequestContext['get']>[1]) =>
      patiently(async () =>
        context.get(path, { ...options, headers: { ...options?.headers, ...(await headers()) } }),
      ),
    post: async (path: string, options?: Parameters<APIRequestContext['post']>[1]) =>
      patiently(async () =>
        context.post(path, { ...options, headers: { ...options?.headers, ...(await headers()) } }),
      ),
    dispose: async () => {
      try {
        expect((await context.delete('/api/v1/auth/session')).status()).toBe(204);
      } finally {
        await context.dispose();
      }
    },
  };
}
