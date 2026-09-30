'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { NAV_REGISTRY } from '@/navigation';
import { isPlatformPath } from '@/shared/lib/appPath';
import { eventHref, eventSlugOf } from '@/shared/lib/eventPath';
import { ButtonLink, Card, CardTitle, Stack } from '@/shared/ui';
import { useHomeEvent } from '../hooks/useHomeEvent';

/** A screen path from before event addresses (`/capture/footfall`). */
function isLegacyScreen(path: string): boolean {
  return !isPlatformPath(path) && NAV_REGISTRY.some((entry) => entry.path === path);
}

/**
 * Every address the app does not have. A screen's old address, from a
 * bookmark, an installed app or a notification (ADR-009 §6), goes to that
 * screen in the person's home event; anything else is a plain "not found".
 */
export default function NotFoundScreen(): ReactNode {
  const pathname = usePathname();
  const legacy = isLegacyScreen(pathname);
  const home = useHomeEvent();
  const router = useRouter();

  useEffect(() => {
    if (!legacy) return;
    const rest = `${pathname}${window.location.search}`;
    if (home.state === 'event') router.replace(eventHref(home.slug, rest));
    if (home.state === 'choose' || home.state === 'none') router.replace('/events');
    if (home.state === 'signed-out')
      router.replace(`/sign-in?returnTo=${encodeURIComponent(rest)}`);
  }, [legacy, home, pathname, router]);

  if (legacy) return null;
  const slug = eventSlugOf(pathname);
  return (
    <main className="mx-auto w-full max-w-reading px-md py-lg">
      <Stack>
        <Card className="flex flex-col gap-md text-center">
          <CardTitle as="h1">This page does not exist</CardTitle>
          <p className="text-body text-text-muted">
            The link may be outdated, or the address was mistyped.
          </p>
          <ButtonLink href={slug ? eventHref(slug, '/home') : '/'} variant="primary">
            Back to Home
          </ButtonLink>
        </Card>
      </Stack>
    </main>
  );
}
