'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useCurrentSession } from '@/features/session/useSession';

/** Root: straight to the home screen, or to sign-in. Nothing renders here. */
export default function IndexPage(): ReactNode {
  const session = useCurrentSession();
  const router = useRouter();

  useEffect(() => {
    router.replace(session ? '/home' : '/sign-in');
  }, [session, router]);

  return null;
}
