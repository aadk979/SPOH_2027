import type { MyEvent } from '@spoh/shared';

/**
 * Which event a signed-in person lands in (ADR-001 §5): their only active
 * event; else the one they last used on this device, if still theirs; else
 * none, and they choose. `null` means "show the picker".
 */
export function homeEventSlug(events: readonly MyEvent[], lastUsed: string | null): string | null {
  const active = events.filter((event) => event.membershipStatus === 'ACTIVE');
  if (active.length === 1) return active[0]?.slug ?? null;
  return active.find((event) => event.slug === lastUsed)?.slug ?? null;
}

const LAST_USED = 'spoh.lastEvent';

/** The last event opened on this device; per device, so best effort. */
export function readLastUsedEvent(): string | null {
  try {
    return window.localStorage.getItem(LAST_USED);
  } catch {
    return null;
  }
}

export function rememberLastUsedEvent(slug: string): void {
  try {
    window.localStorage.setItem(LAST_USED, slug);
  } catch {
    // Private mode or storage full: the picker simply asks again next time.
  }
}
