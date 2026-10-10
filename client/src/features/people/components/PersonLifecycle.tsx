import { useState, type ReactNode } from 'react';
import { DeactivatePersonRequest, type PersonDetailResponse } from '@spoh/shared';
import { useMe } from '@/features/session';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Callout, Field, Input, Stack } from '@/shared/ui';
import { useDeactivatePerson, useReactivatePerson } from '../queries';

function WithdrawPerson({ person }: { person: PersonDetailResponse['person'] }): ReactNode {
  const [review, setReview] = useState(false);
  const form = useZodForm(DeactivatePersonRequest, { reason: '' });
  const deactivate = useDeactivatePerson();
  function withdraw(): void {
    const body = form.validate();
    if (body) deactivate.mutate({ id: person.id, body }, { onSuccess: () => setReview(false) });
  }
  return (
    <Stack>
      <Field id="person-reason" label="Reason for deactivating" error={form.errors.reason}>
        {(props) => (
          <Input
            {...props}
            maxLength={500}
            value={form.values.reason}
            onChange={(event) => {
              setReview(false);
              form.setField('reason', event.target.value);
            }}
          />
        )}
      </Field>
      {review ? (
        <Callout tone="warn">
          <p>
            Deactivate {person.displayName} across every event? This disables their sign-in, signs
            out all devices and ends alerts. Captured records stay.
          </p>
          <Button variant="danger" disabled={deactivate.isPending} onClick={withdraw}>
            Confirm deactivate everywhere
          </Button>
          <Button variant="quiet" disabled={deactivate.isPending} onClick={() => setReview(false)}>
            Cancel
          </Button>
        </Callout>
      ) : (
        <Button
          variant="danger"
          disabled={deactivate.isPending}
          onClick={() => {
            if (form.validate()) setReview(true);
          }}
        >
          Deactivate across all events
        </Button>
      )}
      {deactivate.isError ? (
        <Callout tone="alert" role="alert">
          {deactivate.error.message}
        </Callout>
      ) : null}
      {deactivate.isSuccess ? (
        <Callout tone="ok" role="status">
          Person’s access updated.
        </Callout>
      ) : null}
    </Stack>
  );
}
function RestorePerson({ id }: { id: string }): ReactNode {
  const reactivate = useReactivatePerson();
  return (
    <Stack>
      <Button
        variant="secondary"
        disabled={reactivate.isPending}
        onClick={() => reactivate.mutate(id)}
      >
        Reactivate person
      </Button>
      {reactivate.isError ? (
        <Callout tone="alert" role="alert">
          {reactivate.error.message}
        </Callout>
      ) : null}
      {reactivate.isSuccess ? (
        <Callout tone="ok" role="status">
          Person’s access updated.
        </Callout>
      ) : null}
    </Stack>
  );
}
export function PersonLifecycle({ person }: { person: PersonDetailResponse['person'] }): ReactNode {
  const { data: me } = useMe();
  if (person.id === me?.volunteer.id) return <p>You cannot deactivate your own account.</p>;
  return person.deactivatedAt ? (
    <RestorePerson id={person.id} />
  ) : (
    <WithdrawPerson person={person} />
  );
}
