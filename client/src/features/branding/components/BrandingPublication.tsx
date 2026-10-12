import { useEffect, useState } from 'react';
import { Button, ConfirmationDialog, MutationFeedback } from '@/shared/ui';
import type { useBrandingWrites } from '../queries';

export function BrandingPublication({ publish, canPublish, blocked, remaining, onConfirmationChange }: {
  publish: ReturnType<typeof useBrandingWrites>['publish']; canPublish: boolean; blocked: boolean; remaining: number; onConfirmationChange: (open: boolean) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const available = canPublish && !blocked && remaining > 0;
  function confirmation(open: boolean) { setConfirm(open); onConfirmationChange(open); }
  useEffect(() => {
    if (!canPublish) { setConfirm(false); onConfirmationChange(false); }
  }, [canPublish, onConfirmationChange]);
  return <>
    <p className="text-caption text-text-muted">{remaining} publications remain. Published logo files are retained for historical exports.</p>
    {canPublish ? <Button disabled={!available} onClick={() => confirmation(true)}>Publish event branding</Button> : null}
    <MutationFeedback error={publish.error} pending={publish.isPending} saved={publish.isSuccess} operation="Publish branding" success="Published identity is available on sign-in, the shell, TV and new exports." />
    <ConfirmationDialog open={confirm && canPublish} title="Publish this event identity?" confirmLabel="Publish public identity" pending={publish.isPending} onCancel={() => confirmation(false)} onConfirm={() => { if (available) publish.mutate(undefined, { onSuccess: () => confirmation(false) }); }}>
      <p>The saved colour and normalized logo will be public for this event. The event name follows authorized renames. Existing exports remain unchanged.</p>
    </ConfirmationDialog>
  </>;
}
