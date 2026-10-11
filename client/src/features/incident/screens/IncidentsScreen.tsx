'use client';
import { useCallback, useState } from 'react';
import { IncidentStatus } from '@spoh/shared';
import { useAllows, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { useEventId } from '@/shared/lib/eventContext';
import { ButtonLink, Callout, Field, Select, Stack } from '@/shared/ui';
import { useIncidentAccessFailure, useIncidents } from '../queries';
import { IncidentList } from '../components/IncidentList';

export default function IncidentsScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  const eventId = useEventId();
  if (!session) return null;
  return (
    <AppShell
      title="Incidents and follow-ups"
      width="wide"
      back={{ href: '/operations', label: 'Operations' }}
    >
      <Stack>
        {allows('Incident.Report') ? (
          <ButtonLink href="/safety/incident/new">Report an incident</ButtonLink>
        ) : null}
        {!allows('Incident.Read') ? (
          <Callout>Incident management is available to authorised event leaders.</Callout>
        ) : (
          <IncidentOwner key={`${eventId}:${session.volunteerId}`} />
        )}
      </Stack>
    </AppShell>
  );
}

function IncidentOwner() {
  const [denied, setDenied] = useState(false);
  const onAccessLost = useCallback(() => setDenied(true), []);
  return denied ? (
    <Callout role="alert">Incident access is unavailable. Reload your session.</Callout>
  ) : (
    <IncidentReader onAccessLost={onAccessLost} />
  );
}

function IncidentReader({ onAccessLost }: { onAccessLost: () => void }) {
  const [status, setStatus] = useState<IncidentStatus | ''>('');
  const incidents = useIncidents(true, status || undefined);
  useIncidentAccessFailure(incidents.error, onAccessLost);
  return (
    <>
      <Field id="incident-status-filter" label="Show incident status">
        {(props) => (
          <Select
            {...props}
            value={status}
            onChange={(event) => setStatus(event.target.value as IncidentStatus | '')}
          >
            <option value="">Every status</option>
            {IncidentStatus.options.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <IncidentList query={incidents} />
    </>
  );
}
