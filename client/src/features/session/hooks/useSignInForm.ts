import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CreateSessionRequest } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { openSession } from '@/shared/lib/session';

function signInFailure(cause: unknown): string {
  const status = (cause as { status?: number }).status;
  if (status === 404) return 'That email is not on the volunteer roster. Check with your IC.';
  if (status === 403) return 'That account has been deactivated. Speak to your Chief Coordinator.';
  return 'Could not sign in. Check your connection and try again.';
}

/** Development sign-in: a roster email, validated by the session request schema. */
export function useSignInForm(returnTo: string) {
  const router = useRouter();
  const form = useZodForm(CreateSessionRequest, { email: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    // The schema lower-cases the address, as the server does.
    const credentials = form.validate({ email: form.values.email.trim() });
    if (!credentials) return;
    setPending(true);
    setError(null);

    try {
      await openSession(credentials);
      router.replace(returnTo);
    } catch (cause) {
      setError(signInFailure(cause));
    } finally {
      setPending(false);
    }
  }

  return {
    email: form.values.email,
    setEmail: form.setter('email'),
    error: form.errors.email ?? form.errors._form ?? error,
    pending,
    onSubmit,
  };
}
