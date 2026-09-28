'use client';
import { useIncidentForm } from '../hooks/useIncidentForm';
import { IncidentDetails } from '../components/IncidentDetails';

import { type ReactNode } from 'react';
import type { IncidentSeverity, IncidentType } from '@spoh/shared';
import { AppShell } from '@/shared/shell/AppShell';
import { Button, Callout, ChoiceGroup, type ChoiceOption } from '@/shared/ui';
import { useRequireSession } from '@/features/session';

/**
 * Incident report (remediation/phases/P07-client-refactor.md).
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

export default function NewIncidentScreen(): ReactNode {
  const session = useRequireSession();
  const form = useIncidentForm();
  const { type, setType, severity, setSeverity, description, pending, formError, submit } = form;

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

        <IncidentDetails form={form} />

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
