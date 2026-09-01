'use client';

import type { ReactNode } from 'react';
import {
  useAcknowledgeAlert,
  useActiveAlerts,
  useResolveAlert,
} from '@/features/lostPerson/useActiveAlerts';
import { useMe } from '@/features/session/useSession';

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
   * The alert must dominate the screen. It must not become the screen.
   */
  return (
    <div
      role="alert"
      aria-live="assertive"
      // Named, so a screen reader announces what this region is rather than
      // just reading its contents. It also distinguishes it from the router's
      // own live region, which shares role="alert".
      aria-label={`Lost person alert${alerts.length === 1 ? '' : 's'}`}
      className="sticky top-0 z-50 overflow-y-auto"
      style={{ maxHeight: '60dvh' }}
    >
      {alerts.map((alert) => (
        <div
          key={alert.id}
          style={{
            background: 'var(--color-alert)',
            color: '#ffffff',
            boxShadow: 'var(--shadow-lift)',
          }}
          className="px-4 py-4"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold uppercase tracking-wide">
                {/* Text, not colour, carries the meaning (BUILD_PLAN §9.7). */}
                Lost person — search now
              </p>
              <p className="text-sm opacity-90">{alert.ackCount} acknowledged</p>
            </div>

            <p className="text-lg leading-snug">{alert.descriptionText}</p>

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm opacity-90">
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

            <div className="flex flex-wrap items-center gap-3">
              {/*
                Calling still beats tapping. The reporter's number sits next to
                the acknowledge button so a searcher who finds the child can
                reach them without leaving the screen (PRODUCT_BRIEF §7.3).
              */}
              {alert.raisedByPhone ? (
                <a
                  href={`tel:${alert.raisedByPhone.replace(/\s/g, '')}`}
                  className="rounded-full bg-white px-5 py-3 text-base font-semibold"
                  style={{ color: 'var(--color-alert)', minHeight: 44 }}
                >
                  Call {alert.raisedByName}
                </a>
              ) : null}

              <button
                type="button"
                onClick={() => acknowledge.mutate(alert.id)}
                disabled={alert.ackedByMe || acknowledge.isPending}
                className="rounded-full border-2 border-white px-5 py-3 text-base font-semibold disabled:opacity-70"
                style={{ minHeight: 44 }}
              >
                {alert.ackedByMe ? 'Acknowledged ✓' : 'Acknowledge'}
              </button>

              {canResolve ? (
                <button
                  type="button"
                  onClick={() => resolve.mutate({ alertId: alert.id, outcome: 'RESOLVED_FOUND' })}
                  disabled={resolve.isPending}
                  className="rounded-full bg-white px-5 py-3 text-base font-semibold disabled:opacity-70"
                  style={{ color: 'var(--color-alert)', minHeight: 44 }}
                >
                  Found — clear this alert
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
