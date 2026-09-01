'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent, type ReactNode } from 'react';
import type { CommitteeRole } from '@spoh/shared';
import { ApiError, api } from '@/lib/api';
import { clientEnv, isDevAuth } from '@/lib/env';
import { setSession } from '@/lib/session';

interface DevSignInResponse {
  accessToken: string;
  expiresIn: number;
  volunteer: { displayName: string; role: CommitteeRole };
}

/**
 * Sign-in.
 *
 * Two paths, chosen by what the server is running. Against the development auth
 * provider a roster email is enough. Against Cognito this hands off to the
 * hosted sign-in — accounts are provisioned from the roster, never self-signup,
 * so there is deliberately no "create account" affordance here (BUILD_PLAN §6.1).
 */
function SignInForm(): ReactNode {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const returnTo = params.get('returnTo') ?? '/home';

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result = await api<DevSignInResponse>('/dev-auth/sign-in', {
        method: 'POST',
        body: { email: email.trim().toLowerCase() },
      });

      setSession({
        accessToken: result.accessToken,
        displayName: result.volunteer.displayName,
        role: result.volunteer.role,
        expiresAt: Date.now() + result.expiresIn * 1000,
      });

      router.replace(returnTo);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 404
          ? 'That email is not on the volunteer roster. Check with your IC.'
          : 'Could not sign in. Check your connection and try again.',
      );
    } finally {
      setPending(false);
    }
  }

  if (!isDevAuth) {
    return (
      <div className="tile">
        <p className="mb-4" style={{ fontSize: 'var(--text-body)' }}>
          Sign in with the email address on your volunteer roster entry. Your account was created
          for you — there is no sign-up.
        </p>
        <a className="pill inline-block" href={`${clientEnv.apiBaseUrl}/api/v1/auth/login`}>
          Continue to sign in
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="tile flex flex-col gap-4">
      <label htmlFor="email" className="font-semibold">
        Roster email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@spoh2027.test"
        className="rounded-lg border px-4 py-3 text-lg"
        style={{
          borderColor: 'var(--line)',
          background: 'var(--surface)',
          color: 'var(--text)',
          minHeight: 48,
        }}
      />

      {error ? (
        <p role="alert" style={{ color: 'var(--color-alert)' }}>
          {error}
        </p>
      ) : null}

      <button type="submit" className="pill" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Development sign-in. This screen is replaced by Cognito once the user pool is provisioned.
      </p>
    </form>
  );
}

export default function SignInPage(): ReactNode {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <h1
        className="mb-2 text-4xl font-semibold"
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}
      >
        SPOH 2027
      </h1>
      <p className="mb-6" style={{ color: 'var(--text-muted)' }}>
        School of Computing Open House · volunteer operations
      </p>

      <Suspense fallback={<div className="tile">Loading…</div>}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
