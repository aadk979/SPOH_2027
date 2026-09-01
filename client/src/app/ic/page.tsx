'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { StationSummary, SwapRequestRecord } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { BarRow, StatTile } from '@/components/dashboard/StatTile';
import { useStationDashboard } from '@/features/dashboard/useDashboard';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';
import { readableCategory } from '../chief/page';

/**
 * The IC console (PRODUCT_BRIEF §2.5).
 *
 * The per-device breakdown is the reason this screen exists. Two volunteers
 * working the same queue can see each other's totals, so a discrepancy shows up
 * while it can still be explained rather than during reconciliation a week
 * later. The per-minute rate is there for the same reason: an implausible spike
 * usually means somebody is tapping to catch up.
 */
export default function IcConsolePage(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();
  const [stationId, setStationId] = useState<string | null>(null);

  const stations = useQuery({
    queryKey: ['stations'],
    queryFn: async () => (await api<{ data: StationSummary[] }>('/stations')).data,
    enabled: session !== null,
    staleTime: 5 * 60_000,
  });

  const selected = stationId ?? me?.currentAssignment?.station.id;
  const dashboard = useStationDashboard(selected);

  const swaps = useQuery({
    queryKey: ['roster', 'swaps', 'pending'],
    queryFn: async () => (await api<{ data: SwapRequestRecord[] }>('/roster/swaps/pending')).data,
    enabled: session !== null,
    refetchInterval: 30_000,
  });

  if (!session) return null;

  return (
    <AppShell width="wide" title="IC console" back={{ href: '/home', label: 'Home' }}>
      <label htmlFor="station" className="mb-2 block font-semibold">
        Station
      </label>
      <select
        id="station"
        value={selected ?? ''}
        onChange={(event) => setStationId(event.target.value)}
        className="mb-6 w-full rounded-lg border px-4 py-3"
        style={{
          borderColor: 'var(--line)',
          background: 'var(--surface)',
          color: 'var(--text)',
          minHeight: 48,
        }}
      >
        <option value="">Choose a station…</option>
        {(stations.data ?? []).map((station) => (
          <option key={station.id} value={station.id}>
            {station.name}
          </option>
        ))}
      </select>

      {dashboard.data ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile
              label="Registered here"
              value={dashboard.data.registrations.todayTotal}
              unit="registrations"
            />
            <StatTile
              label="Room entries"
              value={dashboard.data.footfall.todayTotal}
              unit="entries, not people"
            />
            <StatTile label="Cards stamped" value={dashboard.data.stamps} unit="stamps" />
          </div>

          {dashboard.data.registrations.byDevice.length > 0 ? (
            <section>
              <h2
                className="mb-3 text-sm font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}
              >
                Registrations per device
              </h2>
              <div className="tile flex flex-col gap-2">
                {dashboard.data.registrations.byDevice.map((device) => (
                  <div key={device.volunteerId}>
                    <BarRow
                      label={device.volunteerName}
                      value={device.value}
                      max={Math.max(
                        1,
                        ...dashboard.data.registrations.byDevice.map((d) => d.value),
                      )}
                    />
                    {device.rateAnomaly ? (
                      <p className="ml-40 text-sm" style={{ color: 'var(--color-warn)' }}>
                        ▲ {device.perMinute}/min — check they are not tapping to catch up
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {dashboard.data.footfall.contributors.length > 0 ? (
            <section>
              <h2
                className="mb-3 text-sm font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}
              >
                Counters contributing
              </h2>
              <div className="tile flex flex-col gap-2">
                {dashboard.data.footfall.contributors.map((contributor) => (
                  <BarRow
                    key={contributor.volunteerId}
                    label={contributor.volunteerName}
                    value={contributor.value}
                    max={Math.max(1, ...dashboard.data.footfall.contributors.map((c) => c.value))}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h2
              className="mb-3 text-sm font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}
            >
              Who is here
            </h2>
            <ul className="tile flex flex-col gap-2">
              {dashboard.data.roster.length === 0 ? (
                <li style={{ color: 'var(--text-muted)' }}>Nobody rostered here today.</li>
              ) : (
                dashboard.data.roster.map((person) => (
                  <li key={person.volunteerId} className="flex justify-between gap-3">
                    <span>
                      {person.volunteerName}
                      <span className="ml-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                        {person.roleLabel}
                      </span>
                    </span>
                    <span
                      className="text-sm font-semibold"
                      style={{
                        color: person.checkedOutAt
                          ? 'var(--text-muted)'
                          : person.checkedInAt
                            ? 'var(--color-ok)'
                            : 'var(--color-warn)',
                      }}
                    >
                      {person.checkedOutAt
                        ? 'Left'
                        : person.checkedInAt
                          ? 'Checked in'
                          : 'Not arrived'}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section>
            <h2
              className="mb-3 text-sm font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}
            >
              Categories
            </h2>
            <div className="tile flex flex-col gap-2">
              {dashboard.data.registrations.byCategory.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>Nothing recorded here today.</p>
              ) : (
                dashboard.data.registrations.byCategory.map((row) => (
                  <BarRow
                    key={row.key}
                    label={readableCategory(row.key)}
                    value={row.value}
                    max={Math.max(
                      1,
                      ...dashboard.data.registrations.byCategory.map((r) => r.value),
                    )}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      ) : selected ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        <p style={{ color: 'var(--text-muted)' }}>Choose a station to see its numbers.</p>
      )}

      <SwapQueue swaps={swaps.data ?? []} onDecided={() => void swaps.refetch()} />
    </AppShell>
  );
}

/** Swap approvals. Two taps, per PRODUCT_BRIEF §6.1. */
function SwapQueue({
  swaps,
  onDecided,
}: {
  swaps: SwapRequestRecord[];
  onDecided(): void;
}): ReactNode {
  const [pending, setPending] = useState<string | null>(null);

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED'): Promise<void> {
    setPending(id);
    try {
      await api(`/roster/swaps/${id}/decide`, { method: 'POST', body: { decision } });
      onDecided();
    } finally {
      setPending(null);
    }
  }

  if (swaps.length === 0) return null;

  return (
    <section className="mt-6">
      <h2
        className="mb-3 text-sm font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-muted)' }}
      >
        Swap requests
      </h2>
      <ul className="flex flex-col gap-3">
        {swaps.map((swap) => (
          <li key={swap.id} className="tile-flat">
            <p>
              <strong>{swap.requesterName}</strong> → <strong>{swap.targetName}</strong>
            </p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {swap.stationName} · {swap.date} ·{' '}
              {swap.block === 'MORNING' ? 'morning' : 'afternoon'}
              {swap.reason ? ` · ${swap.reason}` : ''}
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                className="pill"
                disabled={pending === swap.id}
                onClick={() => void decide(swap.id, 'APPROVED')}
              >
                Approve
              </button>
              <button
                type="button"
                className="pill-quiet"
                disabled={pending === swap.id}
                onClick={() => void decide(swap.id, 'REJECTED')}
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
