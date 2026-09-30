'use client';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useOptionalEvent } from '@/shared/lib/eventContext';
import { eventHref } from '@/shared/lib/eventPath';
import { useMyEvents } from '../queries';

/**
 * Shown only to a person on more than one event's roster (ADR-001 §5).
 * Switching navigates to the other event's home: it never changes the event
 * of the page already open.
 */
export function EventSwitcher(): ReactNode {
  const current = useOptionalEvent();
  const { data: events } = useMyEvents();
  const router = useRouter();
  const open = events?.filter((event) => event.membershipStatus === 'ACTIVE') ?? [];
  if (!current || open.length < 2) return null;

  return (
    <label className="flex min-h-[44px] items-center gap-xs text-on-dark shrink-0">
      <span className="sr-only">Event</span>
      <select
        value={current.slug}
        onChange={(change) => router.push(eventHref(change.target.value, '/home'))}
        className="max-w-[10rem] rounded-xs bg-tile-dark px-xs py-[2px] text-fine text-on-dark"
      >
        {open.map((event) => (
          <option key={event.id} value={event.slug}>
            {event.name}
          </option>
        ))}
      </select>
    </label>
  );
}
