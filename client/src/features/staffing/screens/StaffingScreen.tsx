'use client';
import { useAllows, useRequireSession } from '@/features/session';
import { useCallback, useState } from 'react';
import { usePrivateReadFailure } from '@/shared/hooks/usePrivateReadFailure';
import { RosterImportForm } from '@/features/provisioning';
import { AppShell } from '@/shared/shell/AppShell';
import { useEventId } from '@/shared/lib/eventContext';
import { ButtonLink, Callout, Section, Stack } from '@/shared/ui';
import { listStaffingPeople } from '../api';
import { useStaffingRead } from '../queries';
import { AssignmentBoard } from '../components/AssignmentBoard';
import { EscalationEditor } from '../components/EscalationEditor';
import { SwapReviewQueue } from '../components/SwapReviewQueue';

export default function StaffingScreen() {
  const session = useRequireSession();
  const eventId = useEventId();
  return session ? <StaffingOwner key={`${eventId}:${session.volunteerId}`} /> : null;
}

function StaffingOwner() {
  const [denied, setDenied] = useState(false);
  const onAccessLost = useCallback(() => setDenied(true), []);
  return denied ? (
    <AppShell title="Staffing" back={{ href: '/setup', label: 'Setup' }}>
      <Callout role="alert">Staffing access is unavailable. Reload your session.</Callout>
    </AppShell>
  ) : (
    <StaffingWorkspace onAccessLost={onAccessLost} />
  );
}

function StaffingWorkspace({ onAccessLost }: { onAccessLost: () => void }) {
  const allows = useAllows();
  const people = useStaffingRead('people', listStaffingPeople, allows('People.Read'));
  usePrivateReadFailure(people.error, onAccessLost);
  return (
    <AppShell title="Staffing" back={{ href: '/setup', label: 'Setup' }}>
      <Stack>
        <ButtonLink href="/briefings">Briefing schedule</ButtonLink>
        {allows('Roster.Edit') && allows('People.Read') ? (
          <>
            <Section title="Assignment board">
              <AssignmentBoard enabled />
            </Section>
            <Section title="CSV assignment import">
              <RosterImportForm />
            </Section>
          </>
        ) : (
          <Callout tone="info">
            Assignment editing is unavailable with your current permissions.
          </Callout>
        )}
        {allows('Swap.Decide') ? (
          <Section title="Swap review">
            <SwapReviewQueue />
          </Section>
        ) : null}
        {allows('People.Read') && allows('People.Update') && !people.isError && people.data ? (
          <Section
            title="Escalation chain"
            description="Choose each person's first contact. The server checks for reporting cycles."
          >
            {people.data.map((person) => (
              <EscalationEditor
                key={`${person.id}:${person.reportsToId}`}
                person={person}
                people={people.data!}
              />
            ))}
          </Section>
        ) : null}
        {people.isError ? (
          <Callout tone="alert" role="alert">
            {people.error.message}
          </Callout>
        ) : null}
      </Stack>
    </AppShell>
  );
}
