'use client';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { eventHref } from '@/shared/lib/eventPath';
import { useHomeEvent } from '../hooks/useHomeEvent';
import { NoEvents } from '../components/NoEvents';

/**
 * `/`: into the person's event, to the picker when they have several and
 * none was last used here, or to sign-in. Nothing renders on the way.
 */
export default function StartScreen(): ReactNode {
  const home = useHomeEvent();
  const router = useRouter();

  useEffect(() => {
    if (home.state === 'signed-out') router.replace('/sign-in');
    if (home.state === 'choose') router.replace('/events');
    if (home.state === 'event') router.replace(eventHref(home.slug, '/home'));
  }, [home, router]);

  return home.state === 'none' ? <NoEvents /> : null;
}
