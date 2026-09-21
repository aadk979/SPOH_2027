import { Router, type CookieOptions, type Request, type Response } from 'express';
import { CreateSessionRequest, ERROR_CODES, type SessionResponse } from '@spoh/shared';
import { z } from 'zod';
import { env, isProduction } from '../../config/env.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
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
