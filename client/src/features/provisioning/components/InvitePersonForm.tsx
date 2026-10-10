import type { FormEvent, ReactNode } from 'react';
import { ProvisionVolunteerRequest, type CommitteeRole } from '@spoh/shared';
import { ROLE_LABELS } from '@/features/volunteers';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Callout, Field, Input, Select, Stack } from '@/shared/ui';
import { useInvitePerson } from '../queries';

export function InvitePersonForm(): ReactNode {
  const form = useZodForm(ProvisionVolunteerRequest, {
    displayName: '',
    email: '',
    role: 'VOLUNTEER' as CommitteeRole,
  });
  const invite = useInvitePerson();
  function submit(event: FormEvent): void {
    event.preventDefault();
    const body = form.validate();
    if (body) invite.mutate(body);
  }
  return (
    <form onSubmit={submit}>
      <Stack>
        <Field id="invite-name" label="Name" error={form.errors.displayName}>
          {(props) => (
            <Input
              {...props}
              maxLength={120}
              value={form.values.displayName}
              onChange={(event) => form.setField('displayName', event.target.value)}
            />
          )}
        </Field>
        <Field id="invite-email" label="Email" error={form.errors.email}>
          {(props) => (
            <Input
              {...props}
              type="email"
              maxLength={254}
              value={form.values.email}
              onChange={(event) => form.setField('email', event.target.value)}
            />
          )}
        </Field>
        <Field id="invite-role" label="Role" error={form.errors.role}>
          {(props) => (
            <Select
              {...props}
              value={form.values.role}
              onChange={(event) =>
                form.setField('role', event.target.value as typeof form.values.role)
              }
            >
              {ROLE_LABELS.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="submit" disabled={invite.isPending}>
          {invite.isPending ? 'Inviting…' : 'Invite person'}
        </Button>
        {invite.isError ? (
          <Callout tone="alert" role="alert">
            {invite.error.message}
          </Callout>
        ) : null}
        {invite.isSuccess ? (
          <Callout tone="ok" role="status">
            {invite.data.identityCreated
              ? 'Invited. Their sign-in instructions are sent by Cognito.'
              : 'Added to this event. They can use their existing sign-in.'}
          </Callout>
        ) : null}
      </Stack>
    </form>
  );
}
