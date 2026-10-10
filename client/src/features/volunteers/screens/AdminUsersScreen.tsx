'use client';

import { type ReactNode } from 'react';

import { AppShell } from '@/shared/shell/AppShell';
import { ButtonLink, Callout, Stack } from '@/shared/ui';

import { useAllows, useMe, useRequireSession } from '@/features/session';

import { useVolunteerRoster } from '../hooks/useVolunteerRoster';
import { VolunteerFiltersPanel } from '../components/VolunteerFiltersPanel';
import { VolunteerRosterList } from '../components/VolunteerRosterList';
import { BulkPeoplePanel } from '../components/BulkPeoplePanel';
/**
 * Roster administration (Chief and Admin).
 *
 * The column that earns its place is "last seen". In the week before the event
 * the question is never "does this account exist" — the import created it — but
 * "has this person ever actually opened the app", and that is the difference
 * between a roster of 200 and a workforce of 140 discovering the problem at
 * 09:25 on the day.
 *
 * Deactivation asks for a reason and says plainly what it will do, because it
 * does more than the button implies: it revokes every signed-in device, drops
 * the volunteer's push subscriptions, and disables the account at the identity
 * provider. An admin who thinks they are hiding a row should not discover they
 * locked somebody out of the building's ops app mid-shift.
 */
export default function AdminUsersScreen(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();

  const roster = useVolunteerRoster();
  const allows = useAllows();
  if (!session) return null;
  const canManage = !!me && allows('People.Update');

  return (
    <AppShell title="Volunteers" back={{ href: '/chief', label: 'Ops' }} width="wide">
      <Stack>
        {allows('People.Invite') || allows('Roster.Edit') ? (
          <div>
            <ButtonLink href="/admin/users/invite">Invite or import people</ButtonLink>
          </div>
        ) : null}
        {!canManage ? (
          <Callout tone="info">
            You can see the roster but not change it. Editing a role or withdrawing access is Chief
            and Admin only.
          </Callout>
        ) : null}

        <VolunteerFiltersPanel roster={roster} />
        {canManage && roster.volunteers.data ? (
          <BulkPeoplePanel rows={roster.volunteers.data.data} />
        ) : null}
        <VolunteerRosterList roster={roster} me={me} canManage={canManage} />
      </Stack>
    </AppShell>
  );
}
