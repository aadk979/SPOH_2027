'use client';

import { AppShell } from '@/components/AppShell';
import { NavTile } from '@/components/NavTile';
import { EscalationChain } from '@/components/ShiftOverview';
import { WorkspaceIntro } from '@/components/WorkspaceIntro';
import {
  Button,
  ButtonLink,
  Callout,
  CardGrid,
  LoadingCards,
  Section,
  Stack,
} from '@/components/ui';
import { useMe, useRequireSession } from '@/features/session/useSession';

export default function SafetyPage() {
  const session = useRequireSession();
  const { data: me, isPending, isError, refetch } = useMe();
  if (!session) return null;
  return (
    <AppShell title="Safety & help" width="wide">
      <Stack>
        <WorkspaceIntro eyebrow="Support when it matters" title="Find help. Take action.">
          Report a concern, reunite a visitor with their belongings, or reach your team.
        </WorkspaceIntro>
        <Callout tone="alert" title="Medical or fire emergency?">
          Call for help immediately — do not wait to submit a report in the app.
        </Callout>
        <Section title="Report & respond">
          <CardGrid>
            <NavTile
              href="/safety/incident/new"
              label="Report an incident"
              hint="Record an injury, near-miss or hazard."
            />
            <NavTile
              href="/safety/lost-person/new"
              label="Report a lost person"
              hint="Raise an alert so the team can help."
              emphasis="primary"
            />
            <NavTile
              href="/safety/lost-found"
              label="Lost and found"
              hint="Search for an item or log something handed in."
            />
          </CardGrid>
        </Section>
        {isError ? (
          <Callout tone="warn" title="Team contacts could not be loaded">
            <p>Could not retrieve your escalation contacts. Check your connection and retry.</p>
            <Button variant="secondary" size="sm" className="mt-sm" onClick={() => void refetch()}>
              Retry loading contacts
            </Button>
          </Callout>
        ) : isPending ? (
          <LoadingCards count={1} label="Loading team contacts" />
        ) : me && me.escalationChain.length > 0 ? (
          <EscalationChain me={me} />
        ) : (
          <Callout>
            No team contacts are assigned yet. Ask the event team for your IC’s contact details.
          </Callout>
        )}
        <ButtonLink href="/map" variant="quiet" className="self-start">
          Find AEDs and exits on the floor map <span aria-hidden="true">→</span>
        </ButtonLink>
      </Stack>
    </AppShell>
  );
}
