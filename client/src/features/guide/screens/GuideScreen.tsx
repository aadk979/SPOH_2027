'use client';

import { AppShell } from '@/shared/shell/AppShell';
import { NavTile } from '@/shared/ui/NavTile';
import { WorkspaceIntro } from '@/shared/ui/WorkspaceIntro';
import { FiveThings } from '@/features/shift';
import { CardGrid, Stack } from '@/shared/ui';
import { useRequireSession } from '@/features/session';
import { hubLinks } from '@/navigation';

export default function GuideScreen() {
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
          {hubLinks('/guide').map((link) => (
            <NavTile key={link.href} {...link} />
          ))}
        </CardGrid>
        <FiveThings />
      </Stack>
    </AppShell>
  );
}
