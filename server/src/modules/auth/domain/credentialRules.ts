export interface CredentialStanding {
  revokedAt: Date | null; expiresAt: Date; absoluteExpiresAt: Date | null;
}
export interface RestrictedCredential extends CredentialStanding {
  mfaPending: boolean; providerTokenEncrypted: string | null; providerTokenExpiresAt: Date | null;
}
export function credentialIsCurrent(session: CredentialStanding, now: Date): boolean {
  return !session.revokedAt && session.expiresAt > now &&
    (session.absoluteExpiresAt === null || session.absoluteExpiresAt > now);
}
export function restrictedProviderIsCurrent(session: RestrictedCredential, now: Date): boolean {
  return session.mfaPending && session.providerTokenEncrypted !== null &&
    session.providerTokenExpiresAt !== null && session.providerTokenExpiresAt > now;
}
export function providerAuthenticationIsFresh(at: Date | null, now: Date): boolean {
  if (!at || !Number.isFinite(at.getTime())) return false;
  const elapsed = now.getTime() - at.getTime();
  return elapsed >= 0 && elapsed <= 300_000;
}

/** Provenance comes only from a verified provider claim; malformed claims cannot become fresh authentication. */
export function verifiedAuthenticationAt(seconds: number | undefined): Date | undefined {
  if (seconds === undefined || !Number.isInteger(seconds) || seconds < 0) return undefined;
  const at = new Date(seconds * 1000);
  return Number.isFinite(at.getTime()) ? at : undefined;
}
