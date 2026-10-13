import type { CookieOptions, Request, Response } from 'express';
import { env, isProduction } from '../../../config/env.js';

/**
 * The refresh cookie.
 *
 * `httpOnly`, so page script cannot read it — which is the entire point, since
 * the access token deliberately lives in memory where XSS can reach it but a
 * page reload cannot recover it. Scoped to the auth path, so it is never
 * attached to a capture request; the refresh credential travels to exactly one
 * endpoint and nowhere else.
 */
const LEGACY_REFRESH_COOKIE = 'spoh_refresh';
const REFRESH_COOKIE = isProduction ? '__Secure-spoh_refresh' : LEGACY_REFRESH_COOKIE;

/**
 * The cookie is scoped to the auth path, not the whole API. It exists to renew
 * an access token; nothing else has any business receiving it.
 */
const COOKIE_PATH = '/api/v1/auth';

export const OAUTH_STATE_COOKIE = isProduction ? '__Secure-spoh_oauth_state' : 'spoh_oauth_state';
export const OAUTH_VERIFIER_COOKIE = isProduction ? '__Secure-spoh_pkce_verifier' : 'spoh_pkce_verifier';

function refreshCookieOptions(expiresAt: Date): CookieOptions {
  const crossSite = env.SESSION_COOKIE_CROSS_SITE;

  return {
    httpOnly: true,
    // SameSite=None requires Secure; env validation refuses that combination
    // over plaintext in production.
    secure: isProduction || crossSite,
    sameSite: crossSite ? 'none' : 'lax',
    path: COOKIE_PATH,
    expires: expiresAt,
    ...(!isProduction && env.SESSION_COOKIE_DOMAIN ? { domain: env.SESSION_COOKIE_DOMAIN } : {}),
  };
}

export function setRefreshCookie(
  res: Response,
  session: { refreshToken: string; expiresAt: Date },
): void {
  res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions(session.expiresAt));
  clearLegacyRefreshCookie(res);
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(new Date(0)), expires: undefined });
  clearLegacyRefreshCookie(res);
}

/** A production upgrade stops reading the old name and expires its prior auth-path cookie. */
function clearLegacyRefreshCookie(res: Response): void {
  if (!isProduction) return;
  res.clearCookie(LEGACY_REFRESH_COOKIE, { ...refreshCookieOptions(new Date(0)), expires: undefined });
}

export function readRefreshCookie(req: Request): string | undefined {
  const value = cookiesOf(req)[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Five minutes is generous for a hosted-UI round trip and short enough to not matter if abandoned. */
function oauthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: 5 * 60 * 1000,
  };
}

export function setOAuthCookies(res: Response, login: { state: string; verifier: string }): void {
  res.cookie(OAUTH_STATE_COOKIE, login.state, oauthCookieOptions());
  res.cookie(OAUTH_VERIFIER_COOKIE, login.verifier, oauthCookieOptions());
}

export function clearOAuthCookies(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, { ...oauthCookieOptions(), maxAge: undefined });
  res.clearCookie(OAUTH_VERIFIER_COOKIE, { ...oauthCookieOptions(), maxAge: undefined });
  if (isProduction) {
    res.clearCookie('spoh_oauth_state', { ...oauthCookieOptions(), maxAge: undefined });
    res.clearCookie('spoh_pkce_verifier', { ...oauthCookieOptions(), maxAge: undefined });
  }
}

export function cookiesOf(req: Request): Record<string, unknown> {
  return (req as Request & { cookies?: Record<string, unknown> }).cookies ?? {};
}
