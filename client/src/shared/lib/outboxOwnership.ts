'use client';

import { cancel, flush, listEntries, type OutboxEntry } from '@/shared/lib/outbox';
import { currentVolunteerId } from '@/shared/lib/session';

/**
 * The signed-in volunteer's captures still on this phone, sent or not yet
 * sendable (F03-034, ADR-007 §5). Entries from a build that did not record an
 * owner go with whoever is signed in, as the flush does.
 */
export async function unsentForCurrentVolunteer(): Promise<OutboxEntry[]> {
  const owner = currentVolunteerId();
  return (await listEntries()).filter((entry) => entry.ownerId == null || entry.ownerId === owner);
}

/** Send them now, ignoring the undo grace period and backoff; returns what is left. */
export async function sendUnsentNow(): Promise<OutboxEntry[]> {
  await flush({ force: true });
  return unsentForCurrentVolunteer();
}

/** Drop them. Only after the volunteer has confirmed, on sign-out. */
export async function discardUnsent(entries: readonly OutboxEntry[]): Promise<void> {
  for (const entry of entries) await cancel(entry.id);
}
