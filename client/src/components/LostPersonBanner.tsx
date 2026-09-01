'use client';

import type { ReactNode } from 'react';
import { useAcknowledgeAlert, useActiveAlerts } from '@/features/lostPerson/useActiveAlerts';

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
  const acknowledge = useAcknowledgeAlert();

  const alerts = data?.alerts ?? [];
  if (alerts.length === 0) return null;

  return (
    <div role="alert" aria-live="assertive" className="sticky top-0 z-50">
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

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm opacity-90">
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
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
