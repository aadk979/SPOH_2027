'use client';

import { AppShell } from '@/shared/shell/AppShell';
import { NavTile } from '@/shared/ui/NavTile';
import { WorkspaceIntro } from '@/shared/ui/WorkspaceIntro';
import { FiveThings } from '@/features/shift/components/ShiftOverview';
import { CardGrid, Stack } from '@/shared/ui';
import { useRequireSession } from '@/features/session/useSession';

export default function GuidePage() {
  const session = useRequireSession();
  if (!session) return null;
  return (
    <AppShell title="Event guide" width="wide">
      <Stack>
        <WorkspaceIntro eyebrow="Find your bearings" title="Ready to welcome visitors.">
          Everything you need to know about the event, from finding a room to answering a visitor’s
          first question.
        </WorkspaceIntro>
        <CardGrid>
          <NavTile href="/map" label="Floor map" hint="Find stations, toilets, AEDs and exits." />
          <NavTile
            href="/journey"
            label="Visitor journey"
            hint="Follow the six steps from arrival to Mission Complete."
          />
          <NavTile
            href="/brief"
            label="What do I say"
            hint="Your briefing, course one-liners and visitor questions."
          />
        </CardGrid>
        <FiveThings />
      </Stack>
    </AppShell>
  );
}
