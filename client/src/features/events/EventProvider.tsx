'use client';
import { useEffect, type ReactNode } from 'react';
import { EventContext } from '@/shared/lib/eventContext';
import { useEventSlug } from '@/shared/lib/eventPath';
import { rememberLastUsedEvent } from './model/homeEvent';
import { useMyEvents, useEventPhase } from './queries';

/**
 * Resolves the slug of an `/e/<slug>/…` page to one of the caller's events.
 * Children render only once it is known, so every hook below can rely on an
 * event id. A slug that is not one of the caller's events renders `fallback`;
 * nothing ever falls back to another event.
 */
export function EventProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: (state: 'loading' | 'unknown') => ReactNode;
}): ReactNode {
  const slug = useEventSlug();
  const { data: events, isError } = useMyEvents();
  const event = events?.find((candidate) => candidate.slug === slug) ?? null;
  useEventPhase(event);

  useEffect(() => {
    if (event) rememberLastUsedEvent(event.slug);
  }, [event]);

  if (event) return <EventContext.Provider value={event}>{children}</EventContext.Provider>;
  return fallback(events || isError ? 'unknown' : 'loading');
}
