'use client';

import { useEffect, type ReactNode } from 'react';
import { useLiveDashboard } from '@/features/dashboard/useDashboard';
import { useRequireSession } from '@/features/session/useSession';
import { readableCategory } from '../chief/page';

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
        className="flex min-h-dvh items-center justify-center"
        style={{ background: 'var(--color-void)', color: 'var(--color-on-dark)' }}
      >
        <p className="text-3xl">Connecting…</p>
      </main>
    );
  }

  const alerts = data.safety.activeLostPersonAlerts;
  const silent = data.dataHealth.silentStations;

  return (
    <main
      className="min-h-dvh p-8"
      style={{ background: 'var(--color-void)', color: 'var(--color-on-dark)' }}
    >
      {alerts > 0 ? (
        <div
          className="mb-8 rounded-lg px-8 py-6 text-center"
          style={{ background: 'var(--color-alert)' }}
        >
          <p className="text-5xl font-semibold">
            {alerts} ACTIVE LOST-PERSON ALERT{alerts === 1 ? '' : 'S'}
          </p>
        </div>
      ) : null}

      <header className="mb-8 flex items-baseline justify-between">
        <h1 className="text-4xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
          SPOH 2027 · {data.eventDayLabel ?? 'Ops'}
        </h1>
        <p className="text-2xl" style={{ color: 'var(--color-on-dark-muted)' }}>
          {new Date(data.asOf).toLocaleTimeString('en-SG', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Singapore',
          })}
        </p>
      </header>

      <div className="mb-8 grid grid-cols-3 gap-6">
        <TvStat label="Registered" value={data.registrations.todayTotal} unit="registrations" />
        <TvStat label="Room entries" value={data.footfall.todayTotal} unit="entries, not people" />
        <TvStat
          label="Cards issued"
          value={data.cards.issued}
          unit={`${data.cards.completed} completed`}
        />
      </div>

      <div className="grid grid-cols-2 gap-8">
        <section>
          <TvHeading>Room entries</TvHeading>
          <ul className="flex flex-col gap-3">
            {data.footfall.stations.map((station) => (
              <li key={station.stationId} className="flex items-baseline justify-between text-3xl">
                <span style={{ color: station.silent ? 'var(--color-warn)' : undefined }}>
                  {station.stationName}
                  {station.silent ? ' · silent' : ''}
                </span>
                <span className="font-semibold tabular-nums">
                  {station.todayTotal.toLocaleString('en-SG')}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <TvHeading>Who is arriving</TvHeading>
          <ul className="flex flex-col gap-3">
            {data.registrations.byCategory.slice(0, 6).map((row) => (
              <li key={row.key} className="flex items-baseline justify-between text-3xl">
                <span>{readableCategory(row.key)}</span>
                <span className="font-semibold tabular-nums">
                  {row.value.toLocaleString('en-SG')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {silent.length > 0 || data.staffing.gaps.length > 0 ? (
        <footer
          className="mt-8 rounded-lg px-6 py-4 text-2xl"
          style={{ background: 'var(--color-tile-dark)', color: 'var(--color-warn)' }}
        >
          {silent.length > 0
            ? `Silent: ${silent.map((station) => station.stationName).join(', ')}. `
            : ''}
          {data.staffing.gaps.length > 0
            ? `${data.staffing.gaps.length} staffing gap${data.staffing.gaps.length === 1 ? '' : 's'}.`
            : ''}
        </footer>
      ) : null}
    </main>
  );
}

function TvStat({ label, value, unit }: { label: string; value: number; unit: string }): ReactNode {
  return (
    <div className="rounded-lg p-6" style={{ background: 'var(--color-tile-dark)' }}>
      <p
        className="text-xl uppercase tracking-wide"
        style={{ color: 'var(--color-on-dark-muted)' }}
      >
        {label}
      </p>
      <p
        className="text-7xl font-semibold tabular-nums"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {value.toLocaleString('en-SG')}
      </p>
      <p className="text-xl" style={{ color: 'var(--color-on-dark-muted)' }}>
        {unit}
      </p>
    </div>
  );
}

function TvHeading({ children }: { children: ReactNode }): ReactNode {
  return (
    <h2
      className="mb-4 text-xl uppercase tracking-wide"
      style={{ color: 'var(--color-on-dark-muted)' }}
    >
      {children}
    </h2>
  );
}
