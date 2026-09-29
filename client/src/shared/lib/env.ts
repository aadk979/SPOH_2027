/**
 * Client configuration.
 *
 * Next inlines `NEXT_PUBLIC_*` at build time, so these must be referenced by
 * their full literal names — a computed lookup would come back undefined in the
 * browser bundle.
 *
 * Checked by hand rather than with zod: this module loads on every route, and
 * zod here put ~90 KB gzip on screens that validate nothing (F03-037).
 */
export interface ClientEnv {
  apiBaseUrl: string;
  envLabel: string;
  cognitoRegion?: string;
  cognitoUserPoolId?: string;
  cognitoClientId?: string;
}

type RawClientEnv = { [Key in keyof ClientEnv]?: string | undefined };

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** A misconfigured build fails at load, not at the first request. */
export function readClientEnv(raw: RawClientEnv): ClientEnv {
  const apiBaseUrl = raw.apiBaseUrl ?? '';
  if (!isHttpUrl(apiBaseUrl))
    throw new Error(`API base URL is not an http(s) URL: "${apiBaseUrl}"`);
  const env: ClientEnv = { apiBaseUrl, envLabel: raw.envLabel || 'development' };
  for (const key of ['cognitoRegion', 'cognitoUserPoolId', 'cognitoClientId'] as const) {
    if (raw[key]) env[key] = raw[key];
  }
  return env;
}

export const clientEnv: ClientEnv = readClientEnv({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4010',
  envLabel: process.env.NEXT_PUBLIC_ENV_LABEL,
  cognitoRegion: process.env.NEXT_PUBLIC_COGNITO_REGION,
  cognitoUserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
  cognitoClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
});

/** True when the app is talking to a server running the dev auth provider. */
export const isDevAuth = !clientEnv.cognitoUserPoolId;
