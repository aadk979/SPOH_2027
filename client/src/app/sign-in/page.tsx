'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent, type ReactNode } from 'react';
import { clientEnv, isDevAuth } from '@/lib/env';
import { openSession } from '@/lib/session';
import { Button, ButtonLink, Card, Field, Input, Skeleton } from '@/components/ui';

/**
 * Sign-in.
 *
 * Two paths, chosen by what the server is running. Against the development auth
 * provider a roster email is enough. Against Cognito this hands off to the
 * hosted sign-in — accounts are provisioned from the roster, never self-signup,
 * so there is deliberately no "create account" affordance here (BUILD_PLAN §6.1).
 *
 * Either way the credential is exchanged at `POST /auth/session`, which returns
 * a short-lived access token for memory and sets an httpOnly refresh cookie the
 * page cannot read. That cookie is what makes a reload survivable without ever
 * putting a long-lived credential where script can reach it.
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
      await openSession({ email: email.trim().toLowerCase() });
      router.replace(returnTo);
    } catch (cause) {
      const status = (cause as { status?: number }).status;

      setError(
        status === 404
          ? 'That email is not on the volunteer roster. Check with your IC.'
          : status === 403
            ? 'That account has been deactivated. Speak to your Chief Coordinator.'
            : 'Could not sign in. Check your connection and try again.',
      );
    } finally {
      setPending(false);
    }
  }

  if (!isDevAuth) {
    return (
      <Card className="flex flex-col gap-md">
        <p>
          Sign in with the email address on your volunteer roster entry. Your account was created
          for you — there is no sign-up.
        </p>
        <ButtonLink href={`${clientEnv.apiBaseUrl}/api/v1/auth/login`} size="lg" block>
          Continue to sign in
        </ButtonLink>
      </Card>
    );
  }

  return (
    <Card
      as="form"
      onSubmit={(event: FormEvent) => void onSubmit(event)}
      className="flex flex-col gap-md"
    >
      <Field id="email" label="Roster email" error={error}>
        {(props) => (
          <Input
            {...props}
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            autoCapitalize="off"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@spoh2027.test"
          />
        )}
      </Field>

      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="text-caption text-text-muted">
        Development sign-in. This screen is replaced by Cognito once the user pool is provisioned.
      </p>
    </Card>
  );
}

export default function SignInPage(): ReactNode {
  return (
    /*
     * Centred, and capped at a phone's width even on a laptop. A sign-in form
     * stretched to a reading measure puts the field and its button an eye
     * movement apart for no reason.
     */
    <main className="mx-auto flex min-h-dvh max-w-form flex-col justify-center px-md py-xl">
      <h1 className="text-display">SPOH 2027</h1>
      <p className="mt-xxs mb-lg text-lead text-text-muted">
        School of Computing Open House · volunteer operations
      </p>

      {/*
        `useSearchParams` suspends, so the fallback has to hold the form's
        shape — a bare "Loading…" here made the page jump by 200px on the
        slowest phones, which is the moment somebody taps the wrong thing.
      */}
      <Suspense
        fallback={
          <Card aria-busy="true" aria-label="Loading sign-in" className="flex flex-col gap-md">
            <Skeleton className="w-1/3" />
            <Skeleton height="48px" />
            <Skeleton height="56px" className="rounded-pill" />
          </Card>
        }
      >
        <SignInForm />
      </Suspense>
    </main>
  );
}
