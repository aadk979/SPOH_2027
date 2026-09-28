'use client';

import type { ReactNode } from 'react';
import { useAcknowledgeAlert, useActiveAlerts, useResolveAlert } from '@/features/lostPerson';
import { useMe } from '@/features/session';
import { LostPersonAlert } from './LostPersonAlert';

/**
 * The one element in this app allowed to interrupt whatever is on screen.
 *
 * Full width, top of the page, unmissable (remediation/phases/P07-client-refactor.md). The
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
        <LostPersonAlert
          key={alert.id}
          alert={alert}
          acknowledge={acknowledge}
          resolve={resolve}
          canResolve={canResolve}
        />
      ))}
    </div>
  );
}
