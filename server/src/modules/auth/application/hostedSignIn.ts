import { ERROR_CODES } from '@spoh/shared';
import { env } from '../../../config/env.js';
import { AppError } from '../../../platform/errors/index.js';
import { logger } from '../../../platform/logger/index.js';

/** The Cognito Hosted UI settings, or a 500 when this server has none. */
export function hostedSignInConfig(): { domain: string; clientId: string; appBaseUrl: string } {
  if (!env.COGNITO_DOMAIN || !env.COGNITO_CLIENT_ID || !env.APP_BASE_URL) {
    throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Hosted sign-in is not configured');
  }
  return {
    domain: env.COGNITO_DOMAIN,
    clientId: env.COGNITO_CLIENT_ID,
    appBaseUrl: env.APP_BASE_URL,
  };
}

export function callbackUrl(appBaseUrl: string): string {
  return `${appBaseUrl}/api/v1/auth/callback`;
}

/** Exchange an authorization code for an access token; null when Cognito refuses. */
export async function exchangeCode(
  config: ReturnType<typeof hostedSignInConfig>,
  grant: { code: string; verifier: string },
): Promise<string | null> {
  const tokenResponse = await fetch(new URL('/oauth2/token', config.domain), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code: grant.code,
      redirect_uri: callbackUrl(config.appBaseUrl),
      code_verifier: grant.verifier,
    }),
  });

  if (!tokenResponse.ok) {
    logger.warn(
      { status: tokenResponse.status, body: await tokenResponse.text().catch(() => '') },
      'Cognito token exchange failed',
    );
    return null;
  }

  const tokens = (await tokenResponse.json()) as { access_token?: string };
  return tokens.access_token ?? null;
}
