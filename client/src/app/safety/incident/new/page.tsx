'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { IncidentSeverity, IncidentType } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { Button, Callout, ChoiceGroup, Field, Input, Textarea, type ChoiceOption } from '@/components/ui';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';

/**
 * Incident report (PRODUCT_BRIEF §7.1).
 *
 * Structured, so the slide-43 incident log is generated rather than
 * reconstructed from memory a week later. Location is pre-filled from the
 * reporter's station, and the description field is labelled to describe the
 * EVENT rather than the people — the one free-text box a volunteer can reach,
 * and the one place a name could accidentally end up.
 *
 * Immutable once submitted: corrections go into the append-only follow-up log,
 * which is an IC action.
 */

const TYPES: Array<ChoiceOption<IncidentType>> = [
  { value: 'INJURY', label: 'Injury' },
  { value: 'ILLNESS', label: 'Illness' },
  { value: 'NEAR_MISS', label: 'Near miss' },
  { value: 'SAFETY_CONCERN', label: 'Safety concern' },
  { value: 'CROWD_CONCERN', label: 'Crowd concern' },
  { value: 'EQUIPMENT', label: 'Equipment' },
  { value: 'OTHER', label: 'Other' },
];

const SEVERITIES: Array<ChoiceOption<IncidentSeverity>> = [
  { value: 'LOW', label: 'Low', hint: 'Noted, no action needed now' },
  { value: 'MEDIUM', label: 'Medium', hint: 'Needs attention this shift' },
  { value: 'HIGH', label: 'High', hint: 'Needs an IC now' },
  { value: 'CRITICAL', label: 'Critical', hint: 'Call as well as reporting' },
];

export default function NewIncidentPage(): ReactNode {
  const session = useRequireSession();
  const router = useRouter();
  const { data: me } = useMe();

  const [type, setType] = useState<IncidentType>('NEAR_MISS');
  const [severity, setSeverity] = useState<IncidentSeverity>('LOW');
  const [description, setDescription] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [pending, setPending] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (description.trim().length < 10) {
      setDescriptionError('Please provide at least 10 characters describing what happened.');
      return;
    }

    setPending(true);
    setDescriptionError(null);
    setFormError(null);

    try {
      await api('/incidents', {
        method: 'POST',
        body: {
          type,
          severity,
          ...(me?.currentAssignment ? { stationId: me.currentAssignment.station.id } : {}),
          ...(locationNote.trim() ? { locationNote: locationNote.trim() } : {}),
          description: description.trim(),
          occurredAt: new Date().toISOString(),
          idempotencyKey: crypto.randomUUID(),
        },
      });

      router.replace('/home');
    } catch {
      setFormError('The report could not be sent. Tell your IC directly, then try again.');
    } finally {
      setPending(false);
    }
  }

  if (!session) return null;

  return (
    <AppShell title="Report an incident" back={{ href: '/home', label: 'Home' }}>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-lg">
        <ChoiceGroup
          legend="What kind of incident?"
          name="incident-type"
          value={type}
          onChange={setType}
          options={TYPES}
        />

        <ChoiceGroup
          legend="How serious is it?"
          name="incident-severity"
          value={severity}
          onChange={setSeverity}
          options={SEVERITIES}
          // Stacked, with each level's meaning beside it. As chips, "Low" and
          // "Critical" looked like equivalent choices — severity is the field
          // that decides whether an IC is interrupted.
          layout="list"
        />

        <Field
          id="description"
          label="What happened?"
          hint="Describe the event, not the people. No names. Minimum 10 characters."
          error={descriptionError}
        >
          {(props) => (
            <Textarea
              {...props}
              required
              minLength={10}
              maxLength={2000}
              rows={4}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                if (descriptionError) setDescriptionError(null);
              }}
              placeholder="A cable across the walkway was taped down after someone tripped on it."
            />
          )}
        </Field>

        <Field
          id="location"
          label="Where, exactly?"
          optional
          hint={
            me?.currentAssignment
              ? `Recorded against ${me.currentAssignment.station.name}. Add the detail that would help someone find the spot.`
              : 'Add the detail that would help someone find the spot.'
          }
        >
          {(props) => (
            <Input
              {...props}
              value={locationNote}
              onChange={(event) => setLocationNote(event.target.value)}
              placeholder={
                me?.currentAssignment
                  ? `Near the entrance to ${me.currentAssignment.station.name}`
                  : 'T19, level 2 walkway'
              }
              maxLength={200}
            />
          )}
        </Field>

        {formError ? (
          <Callout tone="alert" role="alert">
            {formError}
          </Callout>
        ) : null}

        <div>
          <Button
            type="submit"
            size="lg"
            block
            disabled={pending || description.trim().length < 10}
          >
            {pending ? 'Sending…' : 'Submit report'}
          </Button>

          <p className="mt-sm text-caption text-text-muted">
            This goes straight to the Safety IC, the Deputy Coordinator and the Chief. Once
            submitted it cannot be edited — updates are added as follow-ups.
          </p>
        </div>
      </form>
    </AppShell>
  );
}
