'use client';

import { AppShell } from '@/components/AppShell';
import { NavTile } from '@/components/NavTile';
import { WorkspaceIntro } from '@/components/WorkspaceIntro';
import { Callout, CardGrid, Section, Stack } from '@/components/ui';
import { useRequireSession } from '@/features/session/useSession';
import { operationLinks } from '@/lib/navigation';

export default function OperationsPage() {
  const session = useRequireSession();
  if (!session) return null;
  const links = operationLinks.filter((item) => session.capabilities.includes(item.capability));
  return (
    <AppShell title="Operations" width="wide">
      <Stack>
        <WorkspaceIntro eyebrow="Event workspace" title="Keep the day running smoothly.">
          Monitor activity, coordinate your team and manage event operations.
        </WorkspaceIntro>
        {links.length === 0 ? (
          <Callout>
            Operations tools are available to assigned event leaders. Your shift and event guide are
            in the main navigation.
          </Callout>
        ) : (
          ['Monitor', 'Manage', 'Recover & report'].map((group) => {
            const items = links.filter((item) => item.group === group);
            return items.length > 0 ? (
              <Section key={group} title={group}>
                <CardGrid columns={2}>
                  {items.map((item) => (
                    <NavTile key={item.href} {...item} />
                  ))}
                </CardGrid>
              </Section>
            ) : null;
          })
        )}
      </Stack>
    </AppShell>
  );
}
