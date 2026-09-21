'use client';

import type { ReactNode } from 'react';
import { Button, Callout, Card, CardTitle } from '@/components/ui';
import { usePushRegistration } from '@/features/notification/usePushRegistration';

/**
 * Turn on alerts for this device.
 *
 * Deliberately opt-in from a button rather than a prompt on load. Browsers
 * require a gesture anyway, and a permission dialog that appears the instant an
 * app opens is the one people dismiss forever without reading — after which the
 * lost-person alert cannot reach them for the rest of the event.
 *
 * Every state below is a real one somebody will hit at this event: an older
 * iPhone with no push support, a deployment with no VAPID keys, a volunteer who
 * tapped "block" in September. None of them is an error, because the app keeps
 * checking for alerts every ten seconds regardless — so each says what still
 * works rather than what failed.
 */
export function AlertDelivery(): ReactNode {
  const { state, enable, disable, error } = usePushRegistration();

  if (state === 'loading') return null;

  return (
    <Card className="flex flex-col gap-sm">
      <CardTitle as="h3">Alerts on this phone</CardTitle>

      {error ? (
        <Callout tone="warn" role="status">
          {error}
        </Callout>
      ) : null}

      {state === 'subscribed' ? (
        <>
          <p className="text-body">
            On. A lost-person alert or a critical incident will reach you with the app closed.
          </p>
          <div>
            <Button variant="quiet" size="sm" onClick={() => void disable()}>
              Turn off on this device
            </Button>
          </div>
        </>
      ) : null}

      {state === 'prompt' ? (
        <>
          <p className="text-body">
            Off. You will still see alerts while the app is open — it checks every few seconds — but
            your phone will not buzz in your pocket.
          </p>
          <div>
            <Button size="sm" onClick={() => void enable()}>
              Turn on alerts
            </Button>
          </div>
        </>
      ) : null}

      {state === 'denied' ? (
        <p className="text-body">
          Notifications are blocked for this site in your browser settings. Alerts still appear in
          the app while it is open. To change it, allow notifications for this site and come back.
        </p>
      ) : null}

      {state === 'unsupported' ? (
        <p className="text-body">
          This browser cannot deliver alerts with the app closed. Keep the app open on your shift —
          it checks for alerts every few seconds either way.
        </p>
      ) : null}

      {state === 'unconfigured' ? (
        <p className="text-body">
          Background alerts are not switched on for this deployment. Alerts appear in the app while
          it is open, which is how they are guaranteed to arrive in any case.
        </p>
      ) : null}
    </Card>
  );
}
