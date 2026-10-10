'use client';
import type { ReactNode } from 'react';
import { useAllows, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { Callout, Section, Stack } from '@/shared/ui';
import { InvitePersonForm } from '../components/InvitePersonForm';
import { RosterImportForm } from '../components/RosterImportForm';

export default function ProvisionPeopleScreen(): ReactNode {
  const session = useRequireSession();
  const allows = useAllows();
  if (!session) return null;
  return (
    <AppShell title="Invite people" back={{ href: '/admin/users', label: 'People' }}>
      <Stack>
        {allows('People.Invite') ? (
          <Section title="Invite one person">
            <InvitePersonForm />
          </Section>
        ) : null}
        {allows('Roster.Edit') ? (
          <Section title="Import a roster">
            <RosterImportForm />
          </Section>
        ) : null}
        {!allows('People.Invite') && !allows('Roster.Edit') ? (
          <Callout tone="info">
            Your permissions do not allow inviting people or importing the roster.
          </Callout>
        ) : null}
      </Stack>
    </AppShell>
  );
}
