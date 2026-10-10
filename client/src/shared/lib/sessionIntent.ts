const SIGNED_OUT = '@spoh/client/signed-out';
const EXPECTED_PERSON = '@spoh/client/expected-person';

/** A person id is an account expectation, never a credential or a grant of access. */
export function expectedSessionPerson(): string | null {
  try {
    return localStorage.getItem(EXPECTED_PERSON);
  } catch {
    return null;
  }
}

/** Only a successful explicit sign-in may replace an existing account expectation. */
export function rememberSessionPerson(personId: string): void {
  try {
    localStorage.setItem(EXPECTED_PERSON, personId);
  } catch {
    /* Storage may be unavailable. */
  }
}

/** A first recovered session establishes an expectation; renewal preserves it. */
export function pinRecoveredPerson(personId: string): void {
  if (!expectedSessionPerson()) rememberSessionPerson(personId);
}

/** A credential-free marker prevents a failed offline logout restoring a borrowed phone. */
export function rememberSignOut(): void {
  try {
    localStorage.setItem(SIGNED_OUT, '1');
  } catch {
    /* Storage may be unavailable. */
  }
}

/** Called by an explicit sign-in action or after establishing a new session. */
export function allowSessionRecovery(): void {
  try {
    localStorage.removeItem(SIGNED_OUT);
  } catch {
    /* Storage may be unavailable. */
  }
}

/** The hosted sign-in button deliberately allows choosing a different account. */
export function beginAccountChange(): void {
  allowSessionRecovery();
  try {
    localStorage.removeItem(EXPECTED_PERSON);
  } catch {
    /* Storage may be unavailable. */
  }
}

export function wasSignedOut(): boolean {
  try {
    return localStorage.getItem(SIGNED_OUT) === '1';
  } catch {
    return false;
  }
}
