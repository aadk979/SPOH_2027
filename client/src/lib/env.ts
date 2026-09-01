import { z } from 'zod';

/**
 * Client configuration.
 *
 * Next inlines `NEXT_PUBLIC_*` at build time, so these must be referenced by
 * their full literal names — a computed lookup would come back undefined in the
 * browser bundle.
 */
const ClientEnv = z.object({
  apiBaseUrl: z.url(),
  envLabel: z.string().default('development'),
  cognitoRegion: z.string().optional(),
  cognitoUserPoolId: z.string().optional(),
  cognitoClientId: z.string().optional(),
});

export type ClientEnv = z.infer<typeof ClientEnv>;

export const clientEnv: ClientEnv = ClientEnv.parse({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4010',
  envLabel: process.env.NEXT_PUBLIC_ENV_LABEL ?? 'development',
  cognitoRegion: process.env.NEXT_PUBLIC_COGNITO_REGION,
  cognitoUserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
  cognitoClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
});

/** True when the app is talking to a server running the dev auth provider. */
export const isDevAuth = !clientEnv.cognitoUserPoolId;
