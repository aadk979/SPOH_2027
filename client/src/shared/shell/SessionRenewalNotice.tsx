'use client';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  EMPTY_SNAPSHOT,
  getSessionSnapshot,
  renewSession,
  subscribeToSession,
} from '@/shared/lib/session';
import { useOnline } from '@/shared/hooks/useOnline';
import { Button, Callout, Stack } from '@/shared/ui';

export function SessionRenewalNotice(): ReactNode {
  const { renewalRequired } = useSyncExternalStore(
    subscribeToSession,
    getSessionSnapshot,
    () => EMPTY_SNAPSHOT,
  );
  const online = useOnline();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  async function renew(): Promise<void> {
    setPending(true);
    setFailure(null);
    try {
      await renewSession();
    } catch {
      setFailure('Session renewal could not start. Try again when connected.');
    } finally {
      setPending(false);
    }
  }
  if (!renewalRequired) return null;
  return (
    <Callout tone="warn" role="status" title="Renew your session">
      <Stack>
        <p>Save any changes before continuing. Renewal reloads this page.</p>
        {!online ? <p>You can still read saved guides and record captures offline.</p> : null}
        <Button type="button" disabled={!online || pending} onClick={() => void renew()}>
          {pending ? 'Starting renewal…' : 'Renew session'}
        </Button>
        {failure ? <p role="alert">{failure}</p> : null}
      </Stack>
    </Callout>
  );
}
