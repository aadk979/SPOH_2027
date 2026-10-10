import type { ReactNode } from 'react';
import { Button, Callout, Stack } from '@/shared/ui';

export function EventWizardReview({
  name,
  joined,
  pending,
  confirm,
  edit,
  children,
}: {
  name: string;
  joined: boolean;
  pending: boolean;
  confirm: () => void;
  edit: () => void;
  children?: ReactNode;
}) {
  return (
    <Stack>
      <h3 className="text-title">Review {name}</h3>
      {children}
      <Callout>
        {joined
          ? 'You will join the new event as Admin and open its Setup checklist.'
          : 'You will create this event without joining its roster. It will appear in Manage events.'}
      </Callout>
      <p>The event starts in Draft. Operational records and reports are never copied.</p>
      <Button disabled={pending} onClick={confirm}>
        {pending ? 'Creating…' : 'Create event'}
      </Button>
      <Button variant="secondary" disabled={pending} onClick={edit}>
        Back to details
      </Button>
    </Stack>
  );
}
