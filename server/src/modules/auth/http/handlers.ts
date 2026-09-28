import type { Request, Response } from 'express';
import { ERROR_CODES, type CreateSessionRequest, type SessionResponse } from '@spoh/shared';
import { AppError, NotFoundError } from '../../../platform/errors/index.js';
import { auditContextFrom } from '../../../platform/http/auditContext.js';
import { getAuth } from '../../../platform/identity/index.js';
import { validatedBody, validatedParams } from '../../../platform/http/validate.js';
import { beginLogin } from '../application/beginLogin.js';
import { completeCallback } from '../application/completeCallback.js';
import { endSession } from '../application/endSession.js';
import { listSessions } from '../application/listSessions.js';
import { revokeOwnSession } from '../application/revokeSessions.js';
import { rotateSession } from '../application/rotateSession.js';
import type { SessionContext } from '../application/issueSession.js';
import { signIn } from '../application/signIn.js';
import {
  clearOAuthCookies,
  clearRefreshCookie,
  cookiesOf,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  readRefreshCookie,
  setOAuthCookies,
  setRefreshCookie,
} from './cookies.js';
import { assertTrustedOrigin } from './origin.js';

function sessionContext(req: Request): SessionContext {
  return {
    userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
    ip: req.ip ?? null,
  };
}

/**
 * Open a session.
 *
 * Against Cognito the client posts the access token it just obtained from the
 * hosted sign-in, and it is verified against the pool — once, at the door,
 * rather than on every subsequent request. Against the development provider an
 * email is enough and the server mints the provider token itself.
 */
export async function createSessionHandler(req: Request, res: Response): Promise<void> {
  assertTrustedOrigin(req);
  const body = validatedBody<CreateSessionRequest>(req);
  const opened = await signIn(body, sessionContext(req), auditContextFrom(req));
  setRefreshCookie(res, opened);
  res.status(201).json(opened.response satisfies SessionResponse);
}

/** Hand off to the Cognito Hosted UI (Authorization Code + PKCE). */
export function loginHandler(_req: Request, res: Response): void {
  const login = beginLogin();
  setOAuthCookies(res, login);
  res.redirect(login.authorizeUrl);
}

/** Cognito redirects back here with a code (or an error). */
export async function callbackHandler(req: Request, res: Response): Promise<void> {
  const jar = cookiesOf(req);
  clearOAuthCookies(res);

  const outcome = await completeCallback(
    {
      code: req.query.code,
      state: req.query.state,
      error: req.query.error,
      expectedState: jar[OAUTH_STATE_COOKIE],
      verifier: jar[OAUTH_VERIFIER_COOKIE],
    },
    sessionContext(req),
    auditContextFrom(req),
  );
  if (outcome.session) setRefreshCookie(res, outcome.session);
  res.redirect(outcome.redirectTo);
}

/**
 * Renew. This is what makes a hard refresh survivable without ever putting a
 * long-lived credential somewhere script can read it.
 */
export async function refreshHandler(req: Request, res: Response): Promise<void> {
  assertTrustedOrigin(req);

  const presented = readRefreshCookie(req);
  if (!presented) {
    throw new AppError(401, ERROR_CODES.SESSION_EXPIRED, 'No session to refresh. Sign in.');
  }

  try {
    const rotated = await rotateSession(presented, sessionContext(req), auditContextFrom(req));
    setRefreshCookie(res, rotated);
    res.status(200).json(rotated.response satisfies SessionResponse);
  } catch (error) {
    // Whatever went wrong, the cookie in the browser is now worthless. Clearing
    // it stops the client retrying a credential that can never work again.
    clearRefreshCookie(res);
    throw error;
  }
}

/** Sign out. Idempotent, and always clears the cookie even if the token was already dead. */
export async function signOutHandler(req: Request, res: Response): Promise<void> {
  assertTrustedOrigin(req);
  await endSession(readRefreshCookie(req), auditContextFrom(req));
  clearRefreshCookie(res);
  res.status(204).end();
}

/**
 * The devices this volunteer is signed in on.
 *
 * A phone that was borrowed and not returned is an ordinary event here, and
 * "sign that one out" should not require an administrator.
 */
export async function listSessionsHandler(req: Request, res: Response): Promise<void> {
  const auth = getAuth(req);
  const sessions = await listSessions(auth.volunteerId, auth.sessionId ?? null);
  res.status(200).json({ data: sessions, meta: { count: sessions.length, nextCursor: null } });
}

export async function revokeSessionHandler(req: Request, res: Response): Promise<void> {
  assertTrustedOrigin(req);

  const auth = getAuth(req);
  const { id } = validatedParams<{ id: string }>(req);

  // Scoped to the caller's own sessions inside the query, so one volunteer
  // cannot sign another one out by guessing an id (IDOR).
  const revoked = await revokeOwnSession(auth.volunteerId, id, auditContextFrom(req));
  if (!revoked) throw new NotFoundError('Session');

  if (id === auth.sessionId) clearRefreshCookie(res);

  res.status(204).end();
}
