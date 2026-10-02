import { ERROR_CODES } from '@spoh/shared';
import type { AuditContext } from '../../../platform/audit/index.js';
import { AppError } from '../../../platform/errors/index.js';
import { authProvider } from '../../../platform/identity/index.js';
import { clientSignInOrigin, exchangeCode, hostedSignInConfig } from './hostedSignIn.js';
import type { OpenedSession, SessionContext } from './issueSession.js';
import { openSession } from './openSession.js';

export interface CallbackInput {
  code: unknown;
  state: unknown;
  error: unknown;
  expectedState: unknown;
  verifier: unknown;
}

/**
 * Cognito redirects back with a code (or an error). The code is exchanged
 * server-side, the resulting access token is verified through the same path
 * every other request goes through, and a session is opened exactly as
 * `POST /session` would — this only supplies the credential. Every failure
 * ends on the sign-in page with a reason, never on an error page.
 */
export async function completeCallback(
  input: CallbackInput,
  context: SessionContext,
  audit: AuditContext,
): Promise<{ redirectTo: string; session?: OpenedSession }> {
  const failed = (reason: string) => ({
    redirectTo: `${clientSignInOrigin()}/sign-in?error=${encodeURIComponent(reason)}`,
  });
  if (input.error) return failed(String(input.error));

  const grant = grantOf(input);
  if (!grant) return failed('state');

  const config = hostedSignInConfig();
  const accessToken = await exchangeCode(config, grant);
  if (!accessToken) return failed('exchange');

  let sub: string;
  try {
    sub = (await authProvider.verify(accessToken)).sub;
  } catch {
    return failed('verify');
  }

  try {
    const session = await openSession(sub, context, audit);
    return { redirectTo: `${clientSignInOrigin()}/`, session };
  } catch (cause) {
    return failed(cause instanceof AppError ? cause.code : ERROR_CODES.INTERNAL_ERROR);
  }
}

/** The code and PKCE verifier, if the returned state matches the one this browser was sent. */
function grantOf(input: CallbackInput): { code: string; verifier: string } | null {
  const { code, state, expectedState, verifier } = input;
  if (
    typeof code !== 'string' ||
    typeof state !== 'string' ||
    typeof expectedState !== 'string' ||
    typeof verifier !== 'string' ||
    state !== expectedState
  ) {
    return null;
  }
  return { code, verifier };
}
