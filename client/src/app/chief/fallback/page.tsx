'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { FallbackWindowRecord, StationSummary } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { useRequireSession } from '@/features/session/useSession';
import { ApiError, api } from '@/lib/api';

/**
 * Declaring and closing a fallback window (PRODUCT_BRIEF §11).
 *
 * This is a command decision, not a volunteer one — the screen exists only for
 * a Deputy Coordinator or the Chief, and it says so. Individual volunteers
 * switching systems on their own is how the same visitor ends up counted in
 * three places.
 *
 * Declaring here does NOT switch anything over. It records that operation was
 * degraded, so every report covering that period says so. The actual switch is
 * a human announcement in the Safety Communications Chat, and the screen
 * reminds whoever is declaring.
 */
export default function FallbackPage(): ReactNode {
  const session = useRequireSession();
  const queryClient = useQueryClient();

  const [tier, setTier] = useState<3 | 4>(3);
  const [reason, setReason] = useState('');
  const [stationId, setStationId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const windows = useQuery({
    queryKey: ['fallback', 'windows'],
    queryFn: async () => (await api<{ data: FallbackWindowRecord[] }>('/fallback/windows')).data,
    enabled: session !== null,
    refetchInterval: 30_000,
  });

  const stations = useQuery({
    queryKey: ['stations'],
    queryFn: async () => (await api<{ data: StationSummary[] }>('/stations')).data,
    enabled: session !== null,
    staleTime: 5 * 60_000,
  });

  const declare = useMutation({
    mutationFn: () =>
      api('/fallback/windows', {
        method: 'POST',
        body: { tier, reason: reason.trim(), ...(stationId ? { stationId } : {}) },
      }),
    onSuccess: () => {
      setReason('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['fallback', 'windows'] });
    },
    onError: (cause) =>
      setError(cause instanceof ApiError ? cause.message : 'Could not declare the window.'),
  });

  const close = useMutation({
    mutationFn: (id: string) => api(`/fallback/windows/${id}/close`, { method: 'POST', body: {} }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['fallback', 'windows'] }),
  });

  if (!session) return null;

  const open = (windows.data ?? []).filter((window) => window.open);
  const closed = (windows.data ?? []).filter((window) => !window.open);

  return (
    <AppShell title="Fallback" back={{ href: '/chief', label: 'Live operations' }}>
      {open.length > 0 ? (
        <section
          className="tile mb-6"
          style={{ borderLeft: '4px solid var(--color-warn)' }}
          aria-label="Open fallback windows"
        >
          <h2 className="mb-2 font-semibold" style={{ color: 'var(--color-warn)' }}>
            {open.length} fallback window{open.length === 1 ? '' : 's'} open
          </h2>
          <ul className="flex flex-col gap-3">
            {open.map((window) => (
              <li key={window.id}>
                <p>
                  <strong>Tier {window.tier}</strong>{' '}
                  {window.tier === 4 ? '(paper pack)' : '(Google fallback pack)'} ·{' '}
                  {window.stationName ?? 'Event-wide'}
                </p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Since {formatTime(window.startedAt)} · declared by {window.declaredByName} ·{' '}
                  {window.reason}
                </p>
                <button
                  type="button"
                  className="pill mt-2"
                  disabled={close.isPending}
                  onClick={() => close.mutate(window.id)}
                >
                  Close this window
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="tile mb-6">
        <h2 className="mb-1 font-semibold">Declare a fallback window</h2>
        <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
          This records that data for a period was captured off-app, so every report covering it says
          so. It does not switch anyone over —{' '}
          <strong>announce the change in the Safety Communications Chat</strong> as well.
        </p>

        <fieldset className="mb-4">
          <legend className="font-semibold">Which tier?</legend>
          <div className="mt-2 flex flex-col gap-2">
            {(
              [
                {
                  value: 3,
                  label: 'Tier 3 — Google fallback pack',
                  hint: 'App or backend unavailable, network fine',
                },
                { value: 4, label: 'Tier 4 — paper pack', hint: 'Total digital failure' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTier(option.value)}
                aria-pressed={tier === option.value}
                className="rounded-lg border px-4 py-3 text-left"
                style={{
                  minHeight: 56,
                  borderColor: tier === option.value ? 'var(--color-primary)' : 'var(--line)',
                  background: tier === option.value ? 'var(--surface-alt)' : 'var(--surface)',
                }}
              >
                <span className="block font-semibold">{option.label}</span>
                <span className="block text-sm" style={{ color: 'var(--text-muted)' }}>
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <label htmlFor="scope" className="block font-semibold">
          Scope
        </label>
        <select
          id="scope"
          value={stationId}
          onChange={(event) => setStationId(event.target.value)}
          className="mt-2 mb-4 w-full rounded-lg border px-4 py-3"
          style={{
            borderColor: 'var(--line)',
            background: 'var(--surface)',
            color: 'var(--text)',
            minHeight: 48,
          }}
        >
          <option value="">Event-wide</option>
          {(stations.data ?? []).map((station) => (
            <option key={station.id} value={station.id}>
              {station.name} only
            </option>
          ))}
        </select>

        <label htmlFor="reason" className="block font-semibold">
          What has happened?
        </label>
        <textarea
          id="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Backend unreachable from the booth since 11:15"
          className="mt-2 w-full rounded-lg border px-4 py-3"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)', color: 'var(--text)' }}
        />

        {error ? (
          <p role="alert" className="mt-2" style={{ color: 'var(--color-alert)' }}>
            {error}
          </p>
        ) : null}

        <button
          type="button"
          className="mt-4 w-full rounded-lg px-5 py-4 font-semibold"
          style={{ background: 'var(--color-warn)', color: '#ffffff', minHeight: 56 }}
          disabled={reason.trim().length < 3 || declare.isPending}
          onClick={() => declare.mutate()}
        >
          {declare.isPending ? 'Declaring…' : `Declare Tier ${tier}`}
        </button>
      </section>

      {closed.length > 0 ? (
        <section>
          <h2
            className="mb-3 text-sm font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            Closed windows
          </h2>
          <ul className="flex flex-col gap-2">
            {closed.map((window) => (
              <li key={window.id} className="tile-flat">
                <p>
                  Tier {window.tier} · {window.stationName ?? 'Event-wide'} ·{' '}
                  <strong>{window.durationMinutes} minutes</strong>
                </p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {formatTime(window.startedAt)} – {formatTime(window.endedAt ?? '')} ·{' '}
                  {window.reason}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}

function formatTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-SG', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
  });
}
