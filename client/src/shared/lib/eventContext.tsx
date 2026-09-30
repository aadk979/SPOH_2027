'use client';
import { createContext, useContext } from 'react';
import type { MyEvent } from '@spoh/shared';
import { eventHref } from './eventPath';

/**
 * The event an `/e/<slug>/…` page works in (ADR-001 §5), provided by
 * `features/events` once the slug is resolved. Every event API path and query
 * key starts with its id; switching events navigates, it never changes the
 * event of a page already open.
 */
export const EventContext = createContext<MyEvent | null>(null);

/** The page's event. Only inside an event page. */
export function useEvent(): MyEvent {
  const event = useContext(EventContext);
  if (!event) throw new Error('useEvent() outside an event page');
  return event;
}

/** The page's event id. */
export function useEventId(): string {
  return useEvent().id;
}

/** The page's event, or null on a platform page (sign-in, the picker). */
export function useOptionalEvent(): MyEvent | null {
  return useContext(EventContext);
}

/** Builds addresses inside the page's event: `href('/home')` → `/e/<slug>/home`. */
export function useEventHref(): (path: string) => string {
  const slug = useEvent().slug;
  return (path) => eventHref(slug, path);
}
