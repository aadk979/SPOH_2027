'use client';
import { type ReactNode } from 'react';
import { ButtonLink, Stack } from '@/shared/ui';
import { useSessionState } from '../useSession';
import { MfaEnrollment } from '../components/MfaEnrollment';

export default function MfaScreen(): ReactNode {
  const { session } = useSessionState();
  return (
    <main className="mx-auto max-w-reading px-md py-lg">
      <Stack>
        <h1 className="text-tagline">Protect your sign-in</h1>
        {!session ? (
          <ButtonLink href="/sign-in">Sign in again</ButtonLink>
        ) : !session.mfaRequired ? (
          <ButtonLink href="/events">Continue to your events</ButtonLink>
        ) : (
          <MfaEnrollment />
        )}
      </Stack>
    </main>
  );
}
