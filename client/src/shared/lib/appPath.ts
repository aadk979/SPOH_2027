'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useOptionalEvent } from './eventContext';
import { eventHref, pathInEvent } from './eventPath';

/**
 * App paths (ADR-001 §5). Screens, the navigation registry and every link
 * speak of a screen by its path inside an event (`/home`, `/capture/footfall`);
 * these helpers turn that into the address of the page's own event
 * (`/e/<slug>/home`). Platform screens (`/`, `/sign-in`, `/events`) and
 * addresses already inside an event are left as they are.
 */

const PLATFORM = /^\/(?:$|[?#]|sign-in(?:[/?#]|$)|events(?:[/?#]|$)|e\/)/;

export function isPlatformPath(path: string): boolean {
  return PLATFORM.test(path);
}

/** An app path as an address in `slug`'s event, or unchanged outside one. */
export function appHref(path: string, slug: string | null): string {
  return slug && path.startsWith('/') && !isPlatformPath(path) ? eventHref(slug, path) : path;
}

/** Resolves app paths against the page's event. */
export function useAppHref(): (path: string) => string {
  const slug = useOptionalEvent()?.slug ?? null;
  return useMemo(() => (path: string) => appHref(path, slug), [slug]);
}

/** `router.push`/`replace` for app paths. */
export function useAppRouter(): { push: (path: string) => void; replace: (path: string) => void } {
  const router = useRouter();
  const toHref = useAppHref();
  return useMemo(
    () => ({
      push: (path: string) => router.push(toHref(path)),
      replace: (path: string) => router.replace(toHref(path)),
    }),
    [router, toHref],
  );
}

/** The current app path: `/e/<slug>/capture` reads as `/capture`, to match the registry. */
export function useAppPathname(): string {
  const pathname = usePathname();
  return useOptionalEvent() ? pathInEvent(pathname) : pathname;
}
