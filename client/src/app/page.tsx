'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSessionState } from '@/features/session/useSession';

/** Root: straight to the home screen, or to sign-in. Nothing renders here. */
export default function IndexPage(): ReactNode {
  const { session, status } = useSessionState();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unknown') return;
    router.replace(session ? '/home' : '/sign-in');
  }, [session, status, router]);

  return null;
}
