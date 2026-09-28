'use client';
import { useFoundItemForm } from '../hooks/useFoundItemForm';
import { FoundItemPhoto } from '../components/FoundItemPhoto';
import { FoundItemFields } from '../components/FoundItemFields';

import { type ReactNode } from 'react';
import { AppShell } from '@/shared/shell/AppShell';
import { Button, Callout } from '@/shared/ui';
import { useRequireSession } from '@/features/session';

/**
 * Log a found item (remediation/phases/P07-client-refactor.md).
 *
 * Three fields that matter: what it is, where it was found, and where it is
 * being kept. The third is the one people forget and the one that makes the
 * item findable again.
 *
 * There is deliberately no field for who lost it. This is a record of an
 * object, not of a person — and the same rule governs the photo: it exists so
 * somebody can recognise a bottle among nine other bottles, and it must never
 * be a picture of the person who lost it or the person collecting it.
 */
export default function NewLostFoundScreen(): ReactNode {
  const session = useRequireSession();
  const form = useFoundItemForm();
  const { itemLabel, pending, formError, submit, me } = form;

  if (!session) return null;

  return (
    <AppShell
      title="Log a found item"
      back={{ href: '/safety/lost-found', label: 'Lost and found' }}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-md">
        <FoundItemFields form={form} />

        <FoundItemPhoto form={form} />

        {me?.currentAssignment ? (
          <p className="text-caption text-text-muted">
            Recorded as found at {me.currentAssignment.station.name}.
          </p>
        ) : null}

        {formError ? (
          <Callout tone="alert" role="alert">
            {formError}
          </Callout>
        ) : null}

        <div>
          <Button type="submit" size="lg" block disabled={pending || itemLabel.trim().length < 2}>
            {pending ? 'Saving…' : 'Log this item'}
          </Button>

          <p className="mt-sm text-caption text-text-muted">
            Do not record anything about the person who lost it.
          </p>
        </div>
      </form>
    </AppShell>
  );
}
