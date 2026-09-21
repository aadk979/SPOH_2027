'use client';

import type { ReactNode } from 'react';
import {
  useAcknowledgeAlert,
  useActiveAlerts,
  useResolveAlert,
} from '@/features/lostPerson/useActiveAlerts';
import { useMe } from '@/features/session/useSession';
import { Button, ButtonLink } from './ui';

/**
 * Button colours for the one red surface in the app.
 *
 * `--color-alert-solid` is the fixed deep red, so white on it clears 6.5:1 in
 * both themes. The kit's own variants cannot be used: they are drawn for a
 * light canvas or a dark tile, and this is neither.
 */
const SOLID =
  'border-transparent bg-on-alert text-alert-solid hover:bg-white/90 active:scale-[0.97] focus-visible:outline-white disabled:opacity-70';
const OUTLINE =
  'border-2 border-on-alert bg-transparent text-on-alert hover:bg-white/10 active:scale-[0.97] focus-visible:outline-white disabled:opacity-70';

/**
 * The one element in this app allowed to interrupt whatever is on screen.
 *
 * Full width, top of the page, unmissable (BUILD_PLAN §9.3 item 1). The
 * Acknowledge button is what gives the Safety IC a live picture of how much of
 * the floor the alert has actually reached — a broadcast nobody confirms is a
 * broadcast you cannot act on.
 *
 * The design language's whisper-soft elevation is spent here and nowhere else:
 * this is the one thing that must lift off the page.
 */
export function LostPersonBanner(): ReactNode {
  const { data } = useActiveAlerts();
  const { data: me } = useMe();
  const acknowledge = useAcknowledgeAlert();
  const resolve = useResolveAlert();

  // IC and above. A volunteer who found the child tells their IC; the person
  // who clears the floor is the person coordinating the search.
  const canResolve = me?.capabilities.includes('lostPerson.resolve') ?? false;

  const alerts = data?.alerts ?? [];
  if (alerts.length === 0) return null;

  /**
   * Capped and internally scrollable.
   *
   * Sticky and unbounded, three concurrent alerts filled a phone screen and
   * made everything beneath the banner unclickable — including the map and the
   * call button a searcher needs. Found by the e2e suite, which could not
   * reach the capture tiles while stale alerts were live.
   *
   * The alert must dominate the screen. It must not become the screen. The
   * cap is 45dvh rather than 60: the app shell now sticks the navigation
   * underneath this, and the two together were taking two thirds of a phone.
   */
  return (
    <div
      role="alert"
      aria-live="assertive"
      // Named, so a screen reader announces what this region is rather than
      // just reading its contents. It also distinguishes it from the router's
      // own live region, which shares role="alert".
      aria-label={`Lost person alert${alerts.length === 1 ? '' : 's'}`}
      className="max-h-[45dvh] overflow-y-auto bg-alert-solid text-on-alert shadow-[var(--shadow-lift)]"
    >
      {alerts.map((alert) => (
        <div key={alert.id} className="border-b border-white/20 px-md py-md last:border-b-0">
          <div className="mx-auto flex max-w-reading flex-col gap-sm">
            <div className="flex items-start justify-between gap-sm">
              <p className="text-caption font-semibold tracking-[0.06em] uppercase">
                {/* Text, not colour, carries the meaning (BUILD_PLAN §9.7). */}
                Lost person — search now
              </p>
              <p className="shrink-0 text-caption text-white/90">{alert.ackCount} acknowledged</p>
            </div>

            <p className="text-lead font-semibold">{alert.descriptionText}</p>

            <dl className="grid grid-cols-[auto_1fr] gap-x-sm gap-y-xxs text-caption text-white/90">
              {alert.approxAge ? (
                <>
                  <dt className="font-semibold">Approx. age</dt>
                  <dd>{alert.approxAge}</dd>
                </>
              ) : null}
              {alert.clothingText ? (
                <>
                  <dt className="font-semibold">Wearing</dt>
                  <dd>{alert.clothingText}</dd>
                </>
              ) : null}
              {alert.lastSeenStationName ? (
                <>
                  <dt className="font-semibold">Last seen</dt>
                  <dd>{alert.lastSeenStationName}</dd>
                </>
              ) : null}
            </dl>

            <div className="flex flex-wrap items-center gap-sm">
              {/*
                Calling still beats tapping. The reporter's number sits next to
                the acknowledge button so a searcher who finds the child can
                reach them without leaving the screen (PRODUCT_BRIEF §7.3).
              */}
              {alert.raisedByPhone ? (
                <ButtonLink
                  variant="unstyled"
                  href={`tel:${alert.raisedByPhone.replace(/\s/g, '')}`}
                  className={SOLID}
                >
                  Call {alert.raisedByName}
                </ButtonLink>
              ) : null}

              <Button
                variant="unstyled"
                onClick={() => acknowledge.mutate(alert.id)}
                disabled={alert.ackedByMe || acknowledge.isPending}
                className={OUTLINE}
              >
                {alert.ackedByMe ? 'Acknowledged ✓' : 'Acknowledge'}
              </Button>

              {canResolve ? (
                <Button
                  variant="unstyled"
                  onClick={() => resolve.mutate({ alertId: alert.id, outcome: 'RESOLVED_FOUND' })}
                  disabled={resolve.isPending}
                  className={SOLID}
                >
                  Found — clear this alert
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
