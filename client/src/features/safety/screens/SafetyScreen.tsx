'use client';

import { AppShell } from '@/shared/shell/AppShell';
import { NavTile } from '@/shared/ui/NavTile';
import { EscalationChain } from '@/features/shift';
import { WorkspaceIntro } from '@/shared/ui/WorkspaceIntro';
import { ButtonLink, Callout, CardGrid, LoadingCards, Section, Stack, ErrorState } from '@/shared/ui';
import { useMe, useRequireSession } from '@/features/session';
import { hubLinks } from '@/navigation';

export default function SafetyScreen() {
  const session = useRequireSession();
  const { data: me, isPending, error, refetch } = useMe();
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
            {hubLinks('/safety').map((link) => (
              <NavTile key={link.href} {...link} />
            ))}
          </CardGrid>
        </Section>
        {error ? (
          <ErrorState error={error} operation="Loading team contacts" onRetry={() => void refetch()} />
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
