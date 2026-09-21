'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { FallbackWindowRecord, StationSummary } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import {
  Button,
  Callout,
  Card,
  CardTitle,
  ChoiceGroup,
  Field,
  Section,
  Select,
  Stack,
  Textarea,
} from '@/components/ui';
import { useRequireSession } from '@/features/session/useSession';
import { ApiError, api } from '@/lib/api';
import { formatTime } from '@/lib/format';

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

  const [tier, setTier] = useState<'3' | '4'>('3');
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
        // The choice control carries strings; the API takes the number.
        body: { tier: Number(tier), reason: reason.trim(), ...(stationId ? { stationId } : {}) },
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
    <AppShell width="wide" title="Fallback" back={{ href: '/chief', label: 'Live operations' }}>
      <Stack>
        {open.length > 0 ? (
          <Card tone="warn" as="section" aria-label="Open fallback windows">
            <CardTitle>
              {open.length} fallback window{open.length === 1 ? '' : 's'} open
            </CardTitle>

            <ul className="mt-sm flex flex-col gap-md">
              {open.map((window) => (
                <li key={window.id}>
                  <p>
                    <strong>Tier {window.tier}</strong>{' '}
                    {window.tier === 4 ? '(paper pack)' : '(Google fallback pack)'} ·{' '}
                    {window.stationName ?? 'Event-wide'}
                  </p>
                  <p className="text-caption text-text-muted">
                    Since {formatTime(window.startedAt)} · declared by {window.declaredByName} ·{' '}
                    {window.reason}
                  </p>
                  <Button
                    className="mt-xs"
                    disabled={close.isPending}
                    onClick={() => close.mutate(window.id)}
                    aria-label={`Close the Tier ${window.tier} window for ${window.stationName ?? 'the whole event'}`}
                  >
                    Close this window
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card as="section" className="flex max-w-panel flex-col gap-md">
          <div>
            <CardTitle>Declare a fallback window</CardTitle>
            <p className="mt-xs text-caption text-text-muted">
              This records that data for a period was captured off-app, so every report covering it
              says so. It does not switch anyone over —{' '}
              <strong>announce the change in the Safety Communications Chat</strong> as well.
            </p>
          </div>

          <ChoiceGroup
            legend="Which tier?"
            name="fallback-tier"
            value={tier}
            onChange={setTier}
            layout="list"
            options={[
              {
                value: '3',
                label: 'Tier 3 — Google fallback pack',
                hint: 'App or backend unavailable, network fine',
              },
              { value: '4', label: 'Tier 4 — paper pack', hint: 'Total digital failure' },
            ]}
          />

          <Field id="scope" label="Scope">
            {(props) => (
              <Select
                {...props}
                value={stationId}
                onChange={(event) => setStationId(event.target.value)}
              >
                <option value="">Event-wide</option>
                {(stations.data ?? []).map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name} only
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field id="reason" label="What has happened?" error={error}>
            {(props) => (
              <Textarea
                {...props}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Backend unreachable from the booth since 11:15"
              />
            )}
          </Field>

          {/*
            Amber rather than blue. Declaring is not destructive, but it marks
            every report that covers the period — it should not look like the
            same class of act as picking a station from a dropdown.
          */}
          <Button
            variant="warn"
            size="lg"
            block
            disabled={reason.trim().length < 3 || declare.isPending}
            onClick={() => declare.mutate()}
          >
            {declare.isPending ? 'Declaring…' : `Declare Tier ${tier}`}
          </Button>
        </Card>

        {closed.length > 0 ? (
          <Section title="Closed windows">
            <ul className="flex flex-col gap-xs">
              {closed.map((window) => (
                <Card as="li" variant="flat" key={window.id}>
                  <p>
                    Tier {window.tier} · {window.stationName ?? 'Event-wide'} ·{' '}
                    <strong>{window.durationMinutes} minutes</strong>
                  </p>
                  <p className="text-caption text-text-muted">
                    {formatTime(window.startedAt)} –{' '}
                    {window.endedAt ? formatTime(window.endedAt) : '—'} · {window.reason}
                  </p>
                </Card>
              ))}
            </ul>
          </Section>
        ) : (
          <Callout tone="ok">No fallback window has been declared. Data is complete.</Callout>
        )}
      </Stack>
    </AppShell>
  );
}
