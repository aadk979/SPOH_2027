'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button, Callout, Field, Input, Textarea } from '@/components/ui';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';

/**
 * Raise a lost-person alert (PRODUCT_BRIEF §7.3).
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
export default function RaiseLostPersonPage(): ReactNode {
  const session = useRequireSession();
  const router = useRouter();
  const { data: me } = useMe();

  const [description, setDescription] = useState('');
  const [approxAge, setApproxAge] = useState('');
  const [clothing, setClothing] = useState('');
  const [pending, setPending] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (description.trim().length < 3) {
      setDescriptionError('Please provide a description of who we are looking for (at least 3 characters).');
      return;
    }

    setPending(true);
    setDescriptionError(null);
    setFormError(null);

    try {
      await api('/lost-person', {
        method: 'POST',
        body: {
          descriptionText: description.trim(),
          ...(approxAge.trim() ? { approxAge: approxAge.trim() } : {}),
          ...(clothing.trim() ? { clothingText: clothing.trim() } : {}),
          ...(me?.currentAssignment ? { lastSeenStationId: me.currentAssignment.station.id } : {}),
          lastSeenAt: new Date().toISOString(),
          idempotencyKey: crypto.randomUUID(),
        },
      });

      router.replace('/home');
    } catch {
      setFormError(
        'The alert could not be sent. Call your IC on the radio now — do not wait for this screen.',
      );
    } finally {
      setPending(false);
    }
  }

  if (!session) return null;

  return (
    <AppShell title="Report a lost person" back={{ href: '/home', label: 'Home' }}>
      <Callout tone="alert" className="mb-lg">
        <strong>If this is a medical or fire emergency, call — do not tap.</strong> This alert
        coordinates a search across every volunteer device.
      </Callout>

      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-md">
        <Field
          id="description"
          label="What has happened, and who are we looking for?"
          error={descriptionError}
        >
          {(props) => (
            <Textarea
              {...props}
              required
              minLength={3}
              maxLength={500}
              rows={3}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                if (descriptionError) setDescriptionError(null);
              }}
              placeholder="Child separated from their group near the Welcome Lounge"
            />
          )}
        </Field>

        {/*
          Age and clothing sit side by side once there is room: they are the two
          things a searcher scans the floor for, and on the banner they are read
          together.
        */}
        <div className="grid gap-md sm:grid-cols-2">
          <Field id="age" label="Approximate age" optional>
            {(props) => (
              <Input
                {...props}
                value={approxAge}
                onChange={(event) => setApproxAge(event.target.value)}
                placeholder="about 8"
              />
            )}
          </Field>

          <Field id="clothing" label="What are they wearing?" optional>
            {(props) => (
              <Input
                {...props}
                value={clothing}
                onChange={(event) => setClothing(event.target.value)}
                placeholder="red jacket, dark jeans"
              />
            )}
          </Field>
        </div>

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
