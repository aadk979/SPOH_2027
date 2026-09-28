import { createHash, randomBytes } from 'node:crypto';
import { callbackUrl, hostedSignInConfig } from './hostedSignIn.js';

/**
 * Hand off to the Cognito Hosted UI.
 *
 * Authorization Code + PKCE, even though the app client has no secret to
 * protect — PKCE is what stops an intercepted code from being redeemed by
 * anyone other than the browser that started this request. The verifier and
 * the anti-CSRF state both live in short-lived httpOnly cookies scoped to the
 * auth path, the same shape as the refresh cookie.
 */
export function beginLogin(): { state: string; verifier: string; authorizeUrl: string } {
  const config = hostedSignInConfig();

  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest().toString('base64url');

  const authorizeUrl = new URL('/oauth2/authorize', config.domain);
  authorizeUrl.searchParams.set('client_id', config.clientId);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'openid email');
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl(config.appBaseUrl));
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  return { state, verifier, authorizeUrl: authorizeUrl.toString() };
}
