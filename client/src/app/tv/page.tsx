'use client';

import { useEffect, type ReactNode } from 'react';
import { useLiveDashboard } from '@/features/dashboard/useDashboard';
import { useRequireSession } from '@/features/session/useSession';
import { cx } from '@/components/ui';
import { formatCount, formatTime, readableCategory } from '@/lib/format';

/**
 * TV mode — the ops-room display (PRODUCT_BRIEF §9).
 *
 * A different problem from the phone dashboard: read from four metres away, by
 * people walking past, never interacted with. So it is dark, enormous, has no
 * navigation at all, and holds a wake lock so nobody has to nudge a mouse every
 * ten minutes.
 *
 * Anything wrong takes the whole top of the screen. The point of a display
 * nobody is looking at is that it catches your eye when it needs to.
 *
 * The type scale here is viewport-relative rather than fixed. The ops room may
 * put this on a 1080p panel or a 4K one, and a fixed 72px figure is half the
 * physical size on the second — the numbers have to stay the same size on the
 * wall, not the same size in pixels.
 */
export default function TvPage(): ReactNode {
  const session = useRequireSession();
  const { data } = useLiveDashboard();

  // Keep the display awake. Best effort — an ops-room browser may refuse.
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;

    const request = async (): Promise<void> => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        // Not available. The display will sleep on its own schedule.
      }
    };

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);

  if (!session) return null;

  if (!data) {
    return (
      <main
        // `data-theme` rather than a pile of colour classes: this screen is
        // permanently dark whatever the browser's preference, and setting the
        // theme means every token beneath it already resolves correctly.
        data-theme="dark"
        className="flex min-h-dvh items-center justify-center bg-void text-on-dark"
      >
        <p className="text-tv-row">Connecting…</p>
      </main>
    );
  }

  const alerts = data.safety.activeLostPersonAlerts;
  const silent = data.dataHealth.silentStations;
  const gaps = data.staffing.gaps.length;

  return (
    <main
      data-theme="dark"
      className="flex min-h-dvh flex-col gap-[2vw] bg-void p-[2vw] text-on-dark"
    >
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

      <header className="flex flex-wrap items-baseline justify-between gap-sm">
        <div className="flex items-baseline gap-sm">
          <h1 className="text-tv-row font-semibold">SPOH 2027 · {data.eventDayLabel ?? 'Ops'}</h1>
          <a
            href="/chief"
            className="rounded-sm bg-tile-dark px-sm py-xxs text-caption text-on-dark-muted no-underline hover:text-on-dark focus-visible:outline-primary-on-dark"
          >
            Exit TV mode
          </a>
        </div>
        <p className="text-tv-row tabular-nums text-on-dark-muted">{formatTime(data.asOf)}</p>
      </header>

      <div className="grid gap-[1.5vw] sm:grid-cols-3">
        <TvStat label="Registered" value={data.registrations.todayTotal} unit="registrations" />
        <TvStat label="Room entries" value={data.footfall.todayTotal} unit="entries, not people" />
        <TvStat
          label="Cards issued"
          value={data.cards.issued}
          unit={`${data.cards.completed} completed`}
        />
      </div>

      {/*
        `min-h-0` on the two panels: without it a long station list stretches
        the grid past the viewport and the footer warning scrolls off a display
        nobody can scroll.
      */}
      <div className="grid min-h-0 flex-1 gap-[2vw] lg:grid-cols-2">
        <TvPanel title="Room entries">
          {data.footfall.stations.length === 0 ? (
            <li className="text-tv-row text-on-dark-muted">No room entries recorded yet today.</li>
          ) : (
            data.footfall.stations.map((station) => (
              <TvRow
                key={station.stationId}
                label={station.stationName}
                value={station.todayTotal}
                muted={station.silent}
                suffix={station.silent ? ' · silent' : ''}
              />
            ))
          )}
        </TvPanel>

        <TvPanel title="Who is arriving">
          {data.registrations.byCategory.length === 0 ? (
            <li className="text-tv-row text-on-dark-muted">No registrations recorded yet today.</li>
          ) : (
            data.registrations.byCategory
              .slice(0, 6)
              .map((row) => (
                <TvRow key={row.key} label={readableCategory(row.key)} value={row.value} />
              ))
          )}
        </TvPanel>
      </div>

      {silent.length > 0 || gaps > 0 ? (
        <footer className="rounded-lg bg-tile-dark px-[1.5vw] py-[1vw] text-tv-row text-warn">
          <span aria-hidden="true">▲ </span>
          {silent.length > 0
            ? `Silent: ${silent.map((station) => station.stationName).join(', ')}. `
            : ''}
          {gaps > 0 ? `${gaps} staffing gap${gaps === 1 ? '' : 's'}.` : ''}
        </footer>
      ) : null}
    </main>
  );
}

function TvStat({ label, value, unit }: { label: string; value: number; unit: string }): ReactNode {
  return (
    <div className="rounded-lg bg-tile-dark p-[1.5vw]">
      <p className="text-tv-label tracking-[0.06em] text-on-dark-muted uppercase">{label}</p>
      <p className="font-display text-tv-stat font-semibold tabular-nums">{formatCount(value)}</p>
      {/* The unit is as load-bearing here as on the phone dashboard: this is
          the screen most likely to be photographed and quoted. */}
      <p className="text-tv-label text-on-dark-muted">{unit}</p>
    </div>
  );
}

function TvPanel({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="flex min-h-0 flex-col">
      <h2 className="mb-[1vw] text-tv-label tracking-[0.06em] text-on-dark-muted uppercase">
        {title}
      </h2>
      <ul className="flex min-h-0 flex-1 flex-col gap-[0.6vw] overflow-hidden">{children}</ul>
    </section>
  );
}

function TvRow({
  label,
  value,
  suffix = '',
  muted = false,
}: {
  label: string;
  value: number;
  suffix?: string;
  muted?: boolean;
}): ReactNode {
  return (
    <li className="flex items-baseline justify-between gap-sm text-tv-row">
      <span className={cx('min-w-0 truncate', muted && 'text-warn')}>
        {label}
        {suffix}
      </span>
      <span className="shrink-0 font-semibold tabular-nums">{formatCount(value)}</span>
    </li>
  );
}
