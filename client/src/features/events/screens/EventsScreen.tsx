'use client';
import type { ReactNode } from 'react';
import type { MyEvent } from '@spoh/shared';
import { useRequireSession } from '@/features/session';
import { eventHref } from '@/shared/lib/eventPath';
import { readableRole } from '@/shared/lib/format';
import { Callout, LoadingRows, Stack } from '@/shared/ui';
import { NavTile } from '@/shared/ui/NavTile';
import { ManageEvents } from '../components/ManageEvents';
import { useMyEvents } from '../queries';

/** `/events`: the picker for a person on more than one event's roster (ADR-001 §5). */
export default function EventsScreen(): ReactNode {
  const session = useRequireSession();
  const { data: events } = useMyEvents();
  if (!session) return null;
  const open = events?.filter((event) => event.membershipStatus === 'ACTIVE');

  return (
    <main className="mx-auto w-full max-w-reading px-md py-lg">
      <Stack>
        <h1 className="text-title font-semibold">Your events</h1>
        {open ? open.map((event) => <EventTile key={event.id} event={event} />) : <LoadingRows />}
        {open?.length === 0 ? (
          <Callout>You are not on an active event roster. An organiser can add you.</Callout>
        ) : null}
        <ManageEvents />
      </Stack>
    </main>
  );
}

function EventTile({ event }: { event: MyEvent }): ReactNode {
  return (
    <NavTile
      href={eventHref(event.slug, '/home')}
      label={event.name}
      hint={`${readableRole(event.role)} · ${event.status.toLowerCase()}`}
    />
  );
}
