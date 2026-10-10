import { randomBytes } from 'node:crypto';
import { env, isProduction } from '../../config/env.js';
import { logger } from '../logger/index.js';
import { createSigningKeys } from './signingKeys.js';

function currentSecret(): string {
  if (env.SESSION_SIGNING_SECRET) return env.SESSION_SIGNING_SECRET;
  if (isProduction) throw new Error('SESSION_SIGNING_SECRET is required in production');
  logger.warn('SESSION_SIGNING_SECRET is unset: restart invalidates local sessions.');
  return randomBytes(32).toString('base64url');
}

export const sessionSigningKeys = createSigningKeys(currentSecret(), env.SESSION_SIGNING_SECRET_PREVIOUS);
export const currentSigningKey = sessionSigningKeys[0] as NonNullable<typeof sessionSigningKeys[0]>;
