import { useState, type ReactNode } from 'react';
import type { VolunteerAdminRecord } from '@spoh/shared';
import { useAllows } from '@/features/session';
import { Button, Callout } from '@/shared/ui';
import { useResendInvite, useSignOutPerson } from '../queries';

function ResendPersonInvite({ volunteer }: { volunteer: VolunteerAdminRecord }): ReactNode {
  const resend = useResendInvite();
  return (
    <>
      <Button
        variant="secondary"
        disabled={resend.isPending}
        onClick={() => resend.mutate(volunteer.id)}
      >
        Resend sign-in invite
      </Button>
      {resend.isSuccess ? (
        <Callout tone="ok" role="status">
          {resend.data.sent
            ? 'Sign-in invite resent.'
            : 'They already have a sign-in. Ask them to open this event with their existing account.'}
        </Callout>
      ) : null}
      {resend.isError ? (
        <Callout tone="alert" role="alert">
          {resend.error.message}
        </Callout>
      ) : null}
    </>
  );
}
function RevokePersonSessions({ volunteer }: { volunteer: VolunteerAdminRecord }): ReactNode {
  const signOut = useSignOutPerson();
  const [review, setReview] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setReview(true)}>
        Sign out everywhere
      </Button>
      {review ? (
        <Callout tone="warn">
          <p>
            Sign {volunteer.displayName} out on every device, across events? Their account and
            captured records stay.
          </p>
          <Button
            variant="danger"
            disabled={signOut.isPending}
            onClick={() => signOut.mutate(volunteer.id, { onSuccess: () => setReview(false) })}
          >
            Confirm sign out everywhere
          </Button>
          <Button variant="quiet" disabled={signOut.isPending} onClick={() => setReview(false)}>
            Cancel
          </Button>
        </Callout>
      ) : null}
      {signOut.isSuccess ? (
        <Callout tone="ok" role="status">
          Signed out {signOut.data.sessionsRevoked} sessions.
        </Callout>
      ) : null}
      {signOut.isError ? (
        <Callout tone="alert" role="alert">
          {signOut.error.message}
        </Callout>
      ) : null}
    </>
  );
}
export function PersonSessionActions({
  volunteer,
}: {
  volunteer: VolunteerAdminRecord;
}): ReactNode {
  const allows = useAllows();
  return (
    <div className="flex flex-col gap-sm">
      {allows('People.Invite') && volunteer.active && !volunteer.hasSignedIn ? (
        <ResendPersonInvite volunteer={volunteer} />
      ) : null}
      {allows('People.Deactivate') ? <RevokePersonSessions volunteer={volunteer} /> : null}
    </div>
  );
}
