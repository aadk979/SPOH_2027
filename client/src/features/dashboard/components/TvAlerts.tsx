import type { ReactNode } from 'react';
import type { LiveDashboardResponse } from '@spoh/shared';
export function TvAlerts({ data }: { data: LiveDashboardResponse }): ReactNode {
  const alerts = data.safety.activeLostPersonAlerts;
  return (
    <>
      {alerts > 0 ? (
        // The solid fill, not `bg-alert`. This page is permanently dark, and in
        // the dark palette `--color-alert` is the LIGHTENED foreground red —
        // white on it is 2.5:1, unreadable at four metres, on the one element
        // that has to be readable from across the room.
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg bg-alert-solid px-[2vw] py-[1.5vw] text-center text-on-alert"
        >
          <p className="text-tv-stat font-display font-semibold">
            {alerts} ACTIVE LOST-PERSON ALERT{alerts === 1 ? '' : 'S'}
          </p>
        </div>
      ) : null}
    </>
  );
}
