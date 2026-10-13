import { createHash } from 'node:crypto';

export interface AccountProfile {
  readonly email: string;
  readonly displayName: string;
  readonly phone?: string | null;
}

export function identityDigest(values: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

/** The journal retains fingerprints, while the original profile stays in its owning table. */
export function accountProfileDigests(profile: AccountProfile) {
  const email = profile.email.trim().toLowerCase();
  return { emailDigest: identityDigest(['email', email]),
    profileDigest: identityDigest(['profile', email, profile.displayName, profile.phone ?? null]) };
}
