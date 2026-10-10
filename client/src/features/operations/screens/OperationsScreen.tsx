'use client';

import { AppShell } from '@/shared/shell/AppShell';
import { NavTile } from '@/shared/ui/NavTile';
import { WorkspaceIntro } from '@/shared/ui/WorkspaceIntro';
import { Callout, CardGrid, Section, Stack } from '@/shared/ui';
import { useAllows, useRequireSession } from '@/features/session';
import { operationGroups } from '@/navigation';

export default function OperationsScreen() {
  const session = useRequireSession();
  if (!session) return null;
  const allows = useAllows();
  const groups = operationGroups({ allows });
  return (
    <AppShell title="Operations" width="wide">
      <Stack>
        <WorkspaceIntro eyebrow="Event workspace" title="Keep the day running smoothly.">
          Monitor activity, coordinate your team and manage event operations.
        </WorkspaceIntro>
        {groups.length === 0 ? (
          <Callout>
            Operations tools are available to assigned event leaders. Your shift and event guide are
            in the main navigation.
          </Callout>
        ) : (
          groups.map(({ group, links }) => (
            <Section key={group} title={group}>
              <CardGrid columns={2}>
                {links.map((link) => (
                  <NavTile key={link.href} {...link} />
                ))}
              </CardGrid>
            </Section>
          ))
        )}
      </Stack>
    </AppShell>
  );
}
