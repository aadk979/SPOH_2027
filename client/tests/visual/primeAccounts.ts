import { expect, type APIRequestContext } from '@playwright/test';

const verifiedApis = new Set<string>();

/** Verify the retained fixture once per worker; opening each app session is separate. */
export async function primeVisualAccounts(request: APIRequestContext) {
  const apiBase = process.env.VISUAL_API_URL ?? 'http://localhost:4012';
  if (verifiedApis.has(apiBase)) return;
  for (const name of ['admin', 'lead', 'chief', 'dc', 'ic', 'booth', 'counter']) {
    const response = await request.post(`${apiBase}/api/v1/dev-auth/sign-in`, {
      data: { email: `${name}@spoh2027.test` },
    });
    expect(response.ok()).toBe(true);
  }
  verifiedApis.add(apiBase);
}
