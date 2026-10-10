import type { Request, Response } from 'express';
import type { RedeemHandoffRequest, VerifyMfaRequest } from '@spoh/shared';
import { auditContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { verifyAccessToken } from '../../../platform/identity/sessionTokens.js';
import { UnauthenticatedError } from '../../../platform/errors/index.js';
import { AppError } from '../../../platform/errors/index.js';
import { recoveryTarget, recoverSession, redeemHandoff } from '../application/handoff.js';
import { beginMfa, verifyMfa } from '../application/mfa.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './cookies.js';
import { assertTrustedOrigin } from './origin.js';

export async function recoverHandler(req: Request, res: Response): Promise<void> {
  const input = recoveryTarget({
    returnTo: req.query.returnTo,
    challenge: req.query.challenge,
    state: req.query.state,
  });
  const token = readRefreshCookie(req);
  input.url.searchParams.set('auth_state', input.state);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  try {
    if (!token) throw new UnauthenticatedError();
    const outcome = await recoverSession(token, input, {
      audit: auditContextFrom(req),
      userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
      ip: req.ip ?? null,
    });
    setRefreshCookie(res, outcome.opened);
    input.url.searchParams.set('auth_code', outcome.code);
  } catch (error) {
    if (!(error instanceof AppError) || error.statusCode !== 401) throw error;
    clearRefreshCookie(res);
    input.url.searchParams.set('auth_status', 'signed-out');
  }
  res.redirect(input.url.toString());
}

export async function handoffHandler(req: Request, res: Response): Promise<void> {
  assertTrustedOrigin(req);
  res.setHeader('Cache-Control', 'no-store');
  res.json(await redeemHandoff(validatedBody<RedeemHandoffRequest>(req)));
}

async function restrictedClaims(req: Request) {
  const token = req.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  const claims = token ? await verifyAccessToken(token) : null;
  if (!claims) throw new UnauthenticatedError();
  return claims;
}

export async function mfaSetupHandler(req: Request, res: Response): Promise<void> {
  assertTrustedOrigin(req);
  res.json(await beginMfa(await restrictedClaims(req)));
}

export async function mfaVerifyHandler(req: Request, res: Response): Promise<void> {
  assertTrustedOrigin(req);
  const { code } = validatedBody<VerifyMfaRequest>(req);
  res.json(await verifyMfa(await restrictedClaims(req), { code, audit: auditContextFrom(req) }));
}
