import { createHash } from 'node:crypto';
import { logger } from '../logger/index.js';
import type { IdentityProvider } from './provisioning.js';

/**
 * Development identity provider.
 *
 * Derives a stable subject from the email so the same person always gets the
 * same `cognitoSub` across database resets — which is what makes seeded fixtures
 * and dev tokens line up. It creates no account anywhere; the local auth
 * provider will accept any token it signs for that subject.
 */
export function createLocalIdentityProvider(): IdentityProvider {
  return {
    name: 'local',

    ensureUser({ email }) {
      const sub = `local:${createHash('sha256').update(email).digest('hex').slice(0, 32)}`;
      return Promise.resolve({ sub, created: true });
    },

    disableUser(email) {
      logger.info({ email }, 'local identity provider: disable is a no-op');
      return Promise.resolve();
    },

    enableUser(email) {
      logger.info({ email }, 'local identity provider: enable is a no-op');
      return Promise.resolve();
    },
  };
}
