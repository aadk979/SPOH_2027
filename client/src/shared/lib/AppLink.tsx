'use client';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { useAppHref } from './appPath';

/**
 * `next/link` for app paths: `/home` goes to the page's own event
 * (`/e/<slug>/home`), platform paths stay as they are (see `appPath.ts`).
 * The one link every shared component uses.
 */
export function AppLink({
  href,
  ...rest
}: Omit<ComponentProps<typeof Link>, 'href'> & { href: string }): ReactNode {
  const toHref = useAppHref();
  return <Link href={toHref(href)} {...rest} />;
}
