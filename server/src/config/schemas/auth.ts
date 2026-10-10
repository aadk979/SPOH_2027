import { z } from 'zod';
import type { EnvRule, NodeEnv } from './common.js';

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      (value === url.origin || value === `${url.origin}/`)
    );
  } catch {
    return false;
  }
}

/** Identity provider, the API's own session tokens and the refresh cookie. */
export const authFields = {
  AUTH_PROVIDER: z.enum(['cognito', 'local']).default('cognito'),
  LOCAL_AUTH_SECRET: z.string().min(32).optional(),
  COGNITO_REGION: z.string().min(1).default('ap-southeast-1'),
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  /** Hosted UI base, e.g. https://<domain>.auth.<region>.amazoncognito.com */
  COGNITO_DOMAIN: z.string().optional(),
  /** This deployment's own public origin, used to build the OAuth redirect_uri. */
  APP_BASE_URL: z.string().optional(),
  /** Browser landing origin after sign-in; defaults to APP_BASE_URL for a shared origin. */
  CLIENT_BASE_URL: z
    .string()
    .refine(isHttpOrigin, 'must be an http(s) origin without credentials, query or fragment')
    .optional(),

  /**
   * Signing key for the API's own access tokens.
   *
   * The API issues its own short-lived token rather than passing the identity
   * provider's straight through, which is what makes the refresh path
   * possible. Required in production; outside it an ephemeral key is
   * generated at boot, so a developer machine needs no extra configuration
   * and every restart simply invalidates its own sessions.
   */
  SESSION_SIGNING_SECRET: z.string().min(32).optional(),
  /** Explicit overlap key, removed after existing access tokens and MFA handoffs expire. */
  SESSION_SIGNING_SECRET_PREVIOUS: z.string().min(32).optional(),
  /**
   * Domain for the refresh cookie. Leave unset for a host-only cookie, which
   * is correct when the API and client share an origin or a parent domain is
   * not required.
   */
  SESSION_COOKIE_DOMAIN: z.string().optional(),
  /**
   * Send the refresh cookie cross-site.
   *
   * Needed when the client is served from a different origin than the API,
   * which is the deployed topology. SameSite=None demands Secure, so this is
   * refused without HTTPS in production.
   */
  SESSION_COOKIE_CROSS_SITE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
};

type AuthEnv = z.infer<z.ZodObject<typeof authFields>> & {
  NODE_ENV: NodeEnv;
  CORS_ALLOWED_ORIGINS: string[];
};

/** Cognito needs its pool, client, Hosted UI and origin; the local bypass never runs in production. */
export const authProviderRule: EnvRule<AuthEnv> = (env, ctx) => {
  if (env.AUTH_PROVIDER === 'cognito') {
    if (!env.COGNITO_USER_POOL_ID) {
      ctx.addIssue({
        code: 'custom',
        path: ['COGNITO_USER_POOL_ID'],
        message: 'required when AUTH_PROVIDER=cognito',
      });
    }
    if (!env.COGNITO_CLIENT_ID) {
      ctx.addIssue({
        code: 'custom',
        path: ['COGNITO_CLIENT_ID'],
        message: 'required when AUTH_PROVIDER=cognito',
      });
    }
    if (!env.COGNITO_DOMAIN) {
      ctx.addIssue({
        code: 'custom',
        path: ['COGNITO_DOMAIN'],
        message: 'required when AUTH_PROVIDER=cognito — the Hosted UI base URL',
      });
    }
    if (!env.APP_BASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_BASE_URL'],
        message: "required when AUTH_PROVIDER=cognito — this deployment's own public origin",
      });
    }
  }

  if (env.AUTH_PROVIDER === 'local') {
    // The local provider mints its own tokens. Allowing it in production
    // would be a complete authentication bypass, so it is refused at boot
    // rather than guarded at each call site.
    if (env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_PROVIDER'],
        message:
          'AUTH_PROVIDER=local is a development-only authentication bypass and is forbidden when NODE_ENV=production',
      });
    }
    if (!env.LOCAL_AUTH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['LOCAL_AUTH_SECRET'],
        message: 'required when AUTH_PROVIDER=local',
      });
    }
  }
};

/** Production sessions need a stable signing key, and a cross-site cookie needs https. */
export const sessionRule: EnvRule<AuthEnv> = (env, ctx) => {
  if (env.NODE_ENV === 'production' && !env.SESSION_SIGNING_SECRET) {
    ctx.addIssue({
      code: 'custom',
      path: ['SESSION_SIGNING_SECRET'],
      message:
        'required in production: an ephemeral key would sign out every volunteer on each deploy and every instance would reject the others tokens',
    });
  }

  if (
    env.NODE_ENV === 'production' &&
    env.SESSION_COOKIE_CROSS_SITE &&
    env.CORS_ALLOWED_ORIGINS.some((origin) => origin.startsWith('http://'))
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['SESSION_COOKIE_CROSS_SITE'],
      message:
        'a cross-site refresh cookie requires SameSite=None, which browsers only accept with Secure — every allowed origin must be https',
    });
  }
};
