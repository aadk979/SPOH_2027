'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { OutboxEntry } from '@/shared/lib/outbox';
import {
  discardUnsent,
  sendUnsentNow,
  unsentForCurrentVolunteer,
} from '@/shared/lib/outboxOwnership';
import { signOut } from '@/shared/lib/session';

/**
 * Sign out, but not past captures still on the phone (ADR-007 §5, F03-034).
 * With nothing of theirs waiting it signs out at once; otherwise it holds the
 * entries so the volunteer can send them now or, after confirming, discard them.
 */
export function useSignOutGuard() {
  const router = useRouter();
  const [waiting, setWaiting] = useState<OutboxEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * On the server as well as locally: the refresh cookie is httpOnly and only
   * the server can clear it, so the redirect waits for that request.
   */
  async function finish(): Promise<void> {
    setWaiting(null);
    await signOut().finally(() => router.replace('/sign-in'));
  }

  async function run(step: () => Promise<OutboxEntry[]>): Promise<void> {
    setBusy(true);
    try {
      const left = await step();
      if (left.length === 0) await finish();
      else setWaiting(left);
    } finally {
      setBusy(false);
    }
  }

  return {
    waiting,
    busy,
    request: () => run(unsentForCurrentVolunteer),
    sendNow: () => run(sendUnsentNow),
    discard: () => run(async () => (await discardUnsent(waiting ?? []), [])),
    cancel: () => setWaiting(null),
  };
}
