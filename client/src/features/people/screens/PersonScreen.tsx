'use client';
import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAllows, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { Callout, LoadingRows, Stack } from '@/shared/ui';
import { usePerson } from '../queries';
import { PersonMemberships } from '../components/PersonMemberships';
import { PersonLifecycle } from '../components/PersonLifecycle';
import { PersonPrivacy } from '../components/PersonPrivacy';

export default function PersonScreen(): ReactNode {
  const session = useRequireSession();
  const allows = useAllows();
  const id = useSearchParams().get('id');
  const person = usePerson(id);
  if (!session) return null;
  return (
    <AppShell title="Person" back={{ href: '/admin/users', label: 'People' }}>
      {!allows('Platform.ManageAdmins') ? (
        <Callout tone="info">Only a platform admin can view a person across events.</Callout>
      ) : !id ? (
        <Callout tone="info">Choose a person from the roster.</Callout>
      ) : person.isError ? (
        <Callout tone="alert" role="alert">
          {person.error.message}
        </Callout>
      ) : !person.data ? (
        <LoadingRows label="Loading person" />
      ) : (
        <Stack>
          <h2 className="text-tagline">{person.data.person.displayName}</h2>
          <p>{person.data.person.email}</p>
          <PersonMemberships memberships={person.data.memberships} />
          <PersonLifecycle person={person.data.person} />
          <PersonPrivacy person={person.data.person} />
        </Stack>
      )}
    </AppShell>
  );
}
