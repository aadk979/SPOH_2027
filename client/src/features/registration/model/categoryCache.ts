import type { CaptureCategoryRecord } from '@spoh/shared';

/**
 * The event's categories as last seen on this device. The booth must work in
 * a dead spot, and its buttons are the event's data now (ADR-002), so the last
 * list is kept per event and shown until a fresh one arrives.
 */
// hardcoding-allowed: the product's own storage prefix, not an event.
const key = (eventId: string) => `spoh.categories.${eventId}`;

export function readCachedCategories(eventId: string): CaptureCategoryRecord[] | undefined {
  try {
    const raw = window.localStorage.getItem(key(eventId));
    return raw ? (JSON.parse(raw) as CaptureCategoryRecord[]) : undefined;
  } catch {
    return undefined;
  }
}

export function cacheCategories(eventId: string, categories: CaptureCategoryRecord[]): void {
  try {
    window.localStorage.setItem(key(eventId), JSON.stringify(categories));
  } catch {
    // Storage full or blocked: the booth still works online.
  }
}
