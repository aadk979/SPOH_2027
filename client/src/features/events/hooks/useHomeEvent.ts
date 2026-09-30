'use client';
import { useSessionState } from '@/features/session';
import { homeEventSlug, readLastUsedEvent } from '../model/homeEvent';
import { useMyEvents } from '../queries';

export type HomeEvent =
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'event'; slug: string }
  | { state: 'choose' }
  | { state: 'none' };

/** Where a signed-in person belongs when no address names an event (ADR-001 §5). */
export function useHomeEvent(): HomeEvent {
  const { session, status } = useSessionState();
  const { data: events, isError } = useMyEvents();
  if (status === 'unknown') return { state: 'loading' };
  if (!session) return { state: 'signed-out' };
  if (isError) return { state: 'choose' };
  if (!events) return { state: 'loading' };
  if (!events.some((event) => event.membershipStatus === 'ACTIVE')) return { state: 'none' };
  const slug = homeEventSlug(events, readLastUsedEvent());
  return slug ? { state: 'event', slug } : { state: 'choose' };
}
