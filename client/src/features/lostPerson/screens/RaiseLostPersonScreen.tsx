'use client';
import { useLostPersonForm } from '../hooks/useLostPersonForm';
import { LostPersonFields } from '../components/LostPersonFields';

import { type ReactNode } from 'react';
import { AppShell } from '@/shared/shell/AppShell';
import { Button, Callout } from '@/shared/ui';
import { useRequireSession } from '@/features/session';

/**
 * Raise a lost-person alert (remediation/phases/P07-client-refactor.md).
 *
 * The highest-value single feature in the system, and the only place it holds a
 * description of a person. Two things shape this screen:
 *
 *  - it is sent directly, NOT through the outbox. A search that starts two
 *    minutes late because a queued write was waiting on a backoff timer is a
 *    search that failed. If the send fails the volunteer is told to use the
 *    radio, rather than being left believing the floor has been alerted.
 *
 *  - the standing instruction stays "call, don't tap". This coordinates a
 *    search; it is not the emergency channel, and the screen says so.
 */
export default function RaiseLostPersonScreen(): ReactNode {
  const session = useRequireSession();
  const form = useLostPersonForm();
  const { description, pending, formError, submit, me } = form;

  if (!session) return null;

  return (
    <AppShell title="Report a lost person" back={{ href: '/home', label: 'Home' }}>
      <Callout tone="alert" className="mb-lg">
        <strong>If this is a medical or fire emergency, call — do not tap.</strong> This alert
        coordinates a search across every volunteer device.
      </Callout>

      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-md">
        <LostPersonFields form={form} />

        {me?.currentAssignment ? (
          <p className="text-caption text-text-muted">
            Last seen will be recorded as {me.currentAssignment.station.name}.
          </p>
        ) : null}

        {formError ? (
          <Callout tone="alert" role="alert">
            {formError}
          </Callout>
        ) : null}

        <div>
          <Button
            type="submit"
            variant="danger"
            size="lg"
            block
            disabled={pending || description.trim().length < 3}
          >
            {pending ? 'Alerting everyone…' : 'Alert every volunteer now'}
          </Button>

          <p className="mt-sm text-caption text-text-muted">
            This description is deleted once the alert is resolved. Only the resolution time is kept
            for the post-event report.
          </p>
        </div>
      </form>
    </AppShell>
  );
}
