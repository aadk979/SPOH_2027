'use client';

import { useState, type ReactNode } from 'react';
import { Button, Card } from '@/shared/ui';
import { cx } from '@/shared/ui/cx';
import { useSignOutGuard } from './useSignOutGuard';

const plural = (count: number) => `${count} capture${count === 1 ? '' : 's'}`;

/** The global bar's sign-out, which first shows captures still on the phone (F03-034). */
export function SignOutButton(): ReactNode {
  const guard = useSignOutGuard();
  return (
    <>
      <button
        type="button"
        onClick={() => void guard.request()}
        disabled={guard.busy}
        className={cx(
          'min-h-[44px] whitespace-nowrap rounded-sm bg-tile-dark px-sm text-fine text-on-dark shrink-0',
          'transition-[transform,background-color] duration-75 hover:bg-tile-dark-2 active:scale-[0.95]',
          'focus-visible:outline-primary-on-dark',
        )}
      >
        Sign out
      </button>
      {guard.waiting ? <UnsentPrompt guard={guard} count={guard.waiting.length} /> : null}
    </>
  );
}

function UnsentPrompt({
  guard,
  count,
}: {
  guard: ReturnType<typeof useSignOutGuard>;
  count: number;
}): ReactNode {
  const [confirming, setConfirming] = useState(false);
  return (
    <Card
      role="alertdialog"
      aria-label="Captures not sent yet"
      className="fixed top-[52px] right-xs z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-sm text-body text-text"
    >
      <p className="font-semibold">
        {plural(count)} from this phone {count === 1 ? 'has' : 'have'} not been sent yet.
      </p>
      <p className="text-caption text-text-muted">
        Signing out keeps them here until you sign in again. Send them now, or discard them if they
        are already on the fallback sheet.
      </p>
      {confirming ? (
        <Button variant="danger" disabled={guard.busy} onClick={() => void guard.discard()}>
          {`Yes, discard ${plural(count)} and sign out`}
        </Button>
      ) : (
        <div className="flex flex-wrap gap-xs">
          <Button disabled={guard.busy} onClick={() => void guard.sendNow()}>
            Send now
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            Discard them
          </Button>
          <Button variant="quiet" onClick={guard.cancel}>
            Cancel
          </Button>
        </div>
      )}
    </Card>
  );
}
