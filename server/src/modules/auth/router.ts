import { createHash, randomBytes } from 'node:crypto';
import { Router, type CookieOptions, type Request, type Response } from 'express';
import { CreateSessionRequest, ERROR_CODES, type SessionResponse } from '@spoh/shared';
import { z } from 'zod';
import { env, isProduction } from '../../config/env.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { getSettings } from '../../lib/settings.js';
import { auditContextFrom } from '../../lib/requestContext.js';
import {
  authProvider,
  getAuth,
  localAuthIssuer,
  requireAuth,
} from '../../middleware/auth/index.js';
import { defaultRateLimit, sensitiveRateLimit } from '../../middleware/rateLimit.js';
import { validate, validatedBody, validatedParams } from '../../middleware/validate.js';
import {
  endSession,
  listSessions,
  openSession,
  revokeOwnSession,
  rotateSession,
} from './service.js';

/**
 * Session endpoints.
 *
 * ── The cookie ──────────────────────────────────────────────────────────────
 *
 * `httpOnly`, so page script cannot read it — which is the entire point, since
 * the access token deliberately lives in memory where XSS can reach it but a
 * page reload cannot recover it. Scoped to this router's path, so it is never
 * attached to a capture request; the refresh credential travels to exactly one
 * endpoint and nowhere else.
 *
 * ── CSRF ────────────────────────────────────────────────────────────────────
 *
 * A cookie-bearing endpoint that mints credentials needs more than SameSite.
 * CORS does not stop a cross-site form POST, and while an attacker could not
 * read the response, they could force a rotation — which would make the
 * victim's next genuine refresh look like token reuse and revoke their whole
 * family. A denial of service dressed as a security feature.
 *
 * Two things prevent it: the JSON content type (a form POST cannot send one
 * without triggering a preflight the allowlist rejects), and an explicit Origin
 * check on every state-changing route here.
 */
export const authRouter: Router = Router();

const REFRESH_COOKIE = 'spoh_refresh';

/**
 * The cookie is scoped to the auth path, not the whole API. It exists to renew
 * an access token; nothing else has any business receiving it.
 */
const COOKIE_PATH = '/api/v1/auth';

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
    ...(env.SESSION_COOKIE_DOMAIN ? { domain: env.SESSION_COOKIE_DOMAIN } : {}),
  };
}

/**
 * Reject a state-changing auth request from an origin we do not serve.
 *
 * A same-origin or non-browser caller sends no Origin header at all, which is
 * allowed — but a browser that does send one must be on the allowlist.
 */
function assertTrustedOrigin(req: Request): void {
  const origin = req.get('origin');
  if (!origin) return;
  if (env.CORS_ALLOWED_ORIGINS.includes(origin)) return;

  throw new ForbiddenError('This request did not come from a known origin');
}

function readRefreshCookie(req: Request): string | undefined {
  const jar = (req as Request & { cookies?: Record<string, unknown> }).cookies;
  const value = jar?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function sessionContext(req: Request): { userAgent: string | null; ip: string | null } {
  return {
    userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
    ip: req.ip ?? null,
  };
}

/**
 * Open a session.
 *
 * Against Cognito the client posts the access token it just obtained from the
 * hosted sign-in, and it is verified against the pool here — once, at the door,
 * rather than on every subsequent request. Against the development provider an
 * email is enough and the server mints the provider token itself.
 */
authRouter.post(
  '/session',
  sensitiveRateLimit,
  validate({ body: CreateSessionRequest }),
  async (req: Request, res: Response) => {
    assertTrustedOrigin(req);

    const body = validatedBody<CreateSessionRequest>(req);
    let sub: string;

    if (body.providerAccessToken) {
      const verified = await authProvider.verify(body.providerAccessToken);
      sub = verified.sub;
    } else {
      // Development sign-in. `localAuthIssuer` is null under Cognito, which is
      // what makes this path unreachable in every deployed environment.
      if (!localAuthIssuer) {
        throw new ValidationError(
          'This server authenticates against Cognito. Send providerAccessToken.',
        );
      }

      const volunteer = await prisma.volunteer.findUnique({
        where: { email: body.email as string },
        select: { cognitoSub: true, role: true },
      });

      if (!volunteer) throw new NotFoundError('Volunteer');

      // Round-trips a real provider token so the dev path exercises the same
      // verification the deployed one does, rather than skipping it.
      const providerToken = await localAuthIssuer.issue({
        sub: volunteer.cognitoSub,
        groups: [body.role ?? volunteer.role],
      });
      const verified = await localAuthIssuer.verify(providerToken);
      sub = verified.sub;
    }

    const opened = await openSession(sub, sessionContext(req), auditContextFrom(req));

    res.cookie(REFRESH_COOKIE, opened.refreshToken, refreshCookieOptions(opened.expiresAt));
    res.status(201).json(opened.response satisfies SessionResponse);
  },
);

const OAUTH_STATE_COOKIE = 'spoh_oauth_state';
const OAUTH_VERIFIER_COOKIE = 'spoh_pkce_verifier';

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

function base64url(input: Buffer): string {
  return input.toString('base64url');
}

/**
 * Hand off to the Cognito Hosted UI.
 *
 * Authorization Code + PKCE, even though the app client has no secret to
 * protect — PKCE is what stops an intercepted code from being redeemed by
 * anyone other than the browser that started this request. The verifier and
 * the anti-CSRF state both live in short-lived httpOnly cookies scoped to this
 * router's path, the same shape as the refresh cookie.
 */
authRouter.get('/login', sensitiveRateLimit, (req: Request, res: Response) => {
  if (!env.COGNITO_DOMAIN || !env.COGNITO_CLIENT_ID || !env.APP_BASE_URL) {
    throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Hosted sign-in is not configured');
  }

  const state = base64url(randomBytes(32));
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());

  res.cookie(OAUTH_STATE_COOKIE, state, oauthCookieOptions());
  res.cookie(OAUTH_VERIFIER_COOKIE, verifier, oauthCookieOptions());

  const redirectUri = `${env.APP_BASE_URL}/api/v1/auth/callback`;
  const authorizeUrl = new URL('/oauth2/authorize', env.COGNITO_DOMAIN);
  authorizeUrl.searchParams.set('client_id', env.COGNITO_CLIENT_ID);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'openid email');
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  res.redirect(authorizeUrl.toString());
});

/**
 * Cognito redirects back here with a code (or an error). The code is
 * exchanged server-side, the resulting access token is verified through the
 * same path every other request goes through, and a session is opened exactly
 * as `POST /session` would — this route only supplies the credential.
 */
authRouter.get('/callback', sensitiveRateLimit, async (req: Request, res: Response) => {
  const signInUrl = `${env.APP_BASE_URL ?? ''}/sign-in`;
  const jar = (req as Request & { cookies?: Record<string, unknown> }).cookies ?? {};
  const expectedState = jar[OAUTH_STATE_COOKIE];
  const verifier = jar[OAUTH_VERIFIER_COOKIE];

  res.clearCookie(OAUTH_STATE_COOKIE, { ...oauthCookieOptions(), maxAge: undefined });
  res.clearCookie(OAUTH_VERIFIER_COOKIE, { ...oauthCookieOptions(), maxAge: undefined });

  const { code, state, error } = req.query;

  if (error) {
    res.redirect(`${signInUrl}?error=${encodeURIComponent(String(error))}`);
    return;
  }

  if (
    typeof code !== 'string' ||
    typeof state !== 'string' ||
    typeof expectedState !== 'string' ||
    typeof verifier !== 'string' ||
    state !== expectedState
  ) {
    res.redirect(`${signInUrl}?error=state`);
    return;
  }

  if (!env.COGNITO_DOMAIN || !env.COGNITO_CLIENT_ID || !env.APP_BASE_URL) {
    throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Hosted sign-in is not configured');
  }

  const redirectUri = `${env.APP_BASE_URL}/api/v1/auth/callback`;
  const tokenUrl = new URL('/oauth2/token', env.COGNITO_DOMAIN);

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.COGNITO_CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });

  if (!tokenResponse.ok) {
    logger.warn(
      { status: tokenResponse.status, body: await tokenResponse.text().catch(() => '') },
      'Cognito token exchange failed',
    );
    res.redirect(`${signInUrl}?error=exchange`);
    return;
  }

  const tokens = (await tokenResponse.json()) as { access_token?: string };
  if (!tokens.access_token) {
    res.redirect(`${signInUrl}?error=exchange`);
    return;
  }

  let sub: string;
  try {
    const verified = await authProvider.verify(tokens.access_token);
    sub = verified.sub;
  } catch {
    res.redirect(`${signInUrl}?error=verify`);
    return;
  }

  try {
    const opened = await openSession(sub, sessionContext(req), auditContextFrom(req));
    res.cookie(REFRESH_COOKIE, opened.refreshToken, refreshCookieOptions(opened.expiresAt));
    res.redirect(`${env.APP_BASE_URL}/home`);
  } catch (cause) {
    const code = cause instanceof AppError ? cause.code : ERROR_CODES.INTERNAL_ERROR;
    res.redirect(`${signInUrl}?error=${encodeURIComponent(code)}`);
  }
});

/**
 * Renew. This is what makes a hard refresh survivable without ever putting a
 * long-lived credential somewhere script can read it.
 */
authRouter.post('/refresh', defaultRateLimit, async (req: Request, res: Response) => {
  assertTrustedOrigin(req);

  const presented = readRefreshCookie(req);

  if (!presented) {
    throw new AppError(401, ERROR_CODES.SESSION_EXPIRED, 'No session to refresh. Sign in.');
  }

  try {
    const rotated = await rotateSession(presented, sessionContext(req), auditContextFrom(req));
    res.cookie(REFRESH_COOKIE, rotated.refreshToken, refreshCookieOptions(rotated.expiresAt));
    res.status(200).json(rotated.response satisfies SessionResponse);
  } catch (error) {
    // Whatever went wrong, the cookie in the browser is now worthless. Clearing
    // it stops the client retrying a credential that can never work again.
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(new Date(0)), expires: undefined });
    throw error;
  }
});

/** Sign out. Idempotent, and always clears the cookie even if the token was already dead. */
authRouter.delete('/session', defaultRateLimit, async (req: Request, res: Response) => {
  assertTrustedOrigin(req);

  await endSession(readRefreshCookie(req), auditContextFrom(req));

  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(new Date(0)), expires: undefined });
  res.status(204).end();
});

/**
 * The devices this volunteer is signed in on.
 *
 * A phone that was borrowed and not returned is an ordinary event here, and
 * "sign that one out" should not require an administrator.
 */
authRouter.get('/sessions', requireAuth, defaultRateLimit, async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const sessions = await listSessions(auth.volunteerId, auth.sessionId ?? null);
  res.status(200).json({ data: sessions, meta: { count: sessions.length, nextCursor: null } });
});

const SessionIdParams = z.object({ id: z.string().min(1).max(64) }).strict();

authRouter.delete(
  '/sessions/:id',
  requireAuth,
  defaultRateLimit,
  validate({ params: SessionIdParams }),
  async (req: Request, res: Response) => {
    assertTrustedOrigin(req);

    const auth = getAuth(req);
    const { id } = validatedParams<z.infer<typeof SessionIdParams>>(req);

    // Scoped to the caller's own sessions inside the query, so one volunteer
    // cannot sign another one out by guessing an id (IDOR).
    const revoked = await revokeOwnSession(auth.volunteerId, id, auditContextFrom(req));
    if (!revoked) throw new NotFoundError('Session');

    if (id === auth.sessionId) {
      res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(new Date(0)), expires: undefined });
    }

    res.status(204).end();
  },
);

/** Exported so the deactivation flow can describe the same cookie it clears. */
export const REFRESH_COOKIE_NAME = REFRESH_COOKIE;

/** Exposed for the client's silent-refresh scheduling. */
export function accessTokenTtlSeconds(): number {
  return env.ACCESS_TOKEN_TTL_SECONDS;
}

/** Session lifetime in days, for the admin screen. */
export function refreshSessionDays(): number {
  return getSettings().refreshSessionDays;
}
