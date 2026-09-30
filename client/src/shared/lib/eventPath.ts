'use client';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';

/**
 * Event screens live under `/e/<slug>/…` (ADR-001 §5). The static export
 * renders that segment once, with the placeholder `_`, and the server maps
 * every slug onto it (ADR-008 §2), so the real slug exists only in the
 * browser's address: it is read from the pathname after hydration, never
 * from `useParams()` (P08.4 spike, remediation/reports/P08/static-export-spike.md).
 */

const EVENT_SEGMENT = /^\/e\/([^/]+)(\/.*)?$/;

/** The slug in `/e/<slug>/…`, or null outside an event (or on the placeholder). */
export function eventSlugOf(pathname: string): string | null {
  const slug = EVENT_SEGMENT.exec(pathname)?.[1];
  return slug && slug !== '_' ? decodeURIComponent(slug) : null;
}

/** The path inside the event: `/e/spoh-2027/capture/footfall` → `/capture/footfall`. */
export function pathInEvent(pathname: string): string {
  return EVENT_SEGMENT.exec(pathname)?.[2] ?? '/';
}

/** An event screen's address: `eventHref('spoh-2027', '/home')` → `/e/spoh-2027/home`. */
export function eventHref(slug: string, path: string): string {
  return `/e/${encodeURIComponent(slug)}${path === '/' ? '' : path}`;
}

const noSubscription = () => () => {};

/** True once hydrated: before that the page is the prerendered placeholder. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/** The current event's slug, null before hydration and outside `/e/…`. */
export function useEventSlug(): string | null {
  const pathname = usePathname();
  const hydrated = useHydrated();
  return hydrated ? eventSlugOf(pathname) : null;
}
