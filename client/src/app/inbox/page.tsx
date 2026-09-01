'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { AnnouncementRecord, StationSummary } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';

/**
 * The announcements inbox (PRODUCT_BRIEF §8).
 *
 * Quiet by default: everything lands here, and only URGENT is eligible for a
 * push. Volunteers who receive forty pushes stop reading pushes by 11am, and
 * then the one that matters is the one they miss.
 */
const INBOX_POLL_MS = 30_000;

export default function InboxPage(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();
  const queryClient = useQueryClient();

  const inbox = useQuery({
    queryKey: ['announcements'],
    queryFn: async () => (await api<{ data: AnnouncementRecord[] }>('/announcements')).data,
    enabled: session !== null,
    refetchInterval: INBOX_POLL_MS,
  });

  const acknowledge = useMutation({
    mutationFn: (id: string) => api(`/announcements/${id}/ack`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['announcements'] }),
  });

  if (!session) return null;

  const canSend = me?.capabilities.includes('announcement.station.send') ?? false;
  const announcements = inbox.data ?? [];

  return (
    <AppShell title="Announcements" back={{ href: '/home', label: 'Home' }}>
      {canSend ? <Composer me={me} /> : null}

      {announcements.length === 0 ? (
        <p className="tile" style={{ color: 'var(--text-muted)' }}>
          Nothing yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {announcements.map((announcement) => (
            <li
              key={announcement.id}
              className="tile"
              style={
                announcement.priority === 'URGENT'
                  ? { borderLeft: '4px solid var(--color-alert)' }
                  : undefined
              }
            >
              <p
                className="mb-1 text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}
              >
                {/* Priority is a word, not a colour (BUILD_PLAN §9.7). */}
                {announcement.priority === 'URGENT'
                  ? 'Urgent'
                  : announcement.priority === 'OPERATIONAL'
                    ? 'Operational'
                    : 'Information'}
                {announcement.targetStationName ? ` · ${announcement.targetStationName}` : ''}
              </p>

              <p style={{ fontSize: 'var(--text-body)' }}>{announcement.body}</p>

              <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                {announcement.authorName} ·{' '}
                {new Date(announcement.createdAt).toLocaleTimeString('en-SG', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Asia/Singapore',
                })}
                {announcement.requiresAck ? ` · ${announcement.ackCount} acknowledged` : ''}
              </p>

              {announcement.requiresAck ? (
                <button
                  type="button"
                  className={announcement.ackedByMe ? 'pill-quiet mt-3' : 'pill mt-3'}
                  disabled={announcement.ackedByMe || acknowledge.isPending}
                  onClick={() => acknowledge.mutate(announcement.id)}
                >
                  {announcement.ackedByMe ? 'Acknowledged ✓' : 'Acknowledge'}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

/** IC and above. Station-targeted by default; event-wide needs a DC. */
function Composer({ me }: { me: ReturnType<typeof useMe>['data'] }): ReactNode {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<'INFO' | 'OPERATIONAL' | 'URGENT'>('OPERATIONAL');
  const [requiresAck, setRequiresAck] = useState(false);
  const [eventWide, setEventWide] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stations = useQuery({
    queryKey: ['stations'],
    queryFn: async () => (await api<{ data: StationSummary[] }>('/stations')).data,
    staleTime: 5 * 60_000,
  });

  const [stationId, setStationId] = useState<string>('');
  const canSendEventWide = me?.capabilities.includes('announcement.event.send') ?? false;

  const send = useMutation({
    mutationFn: () =>
      api('/announcements', {
        method: 'POST',
        body: {
          body: body.trim(),
          priority,
          requiresAck,
          target: eventWide
            ? {}
            : { stationId: stationId || me?.currentAssignment?.station.id || null },
        },
      }),
    onSuccess: () => {
      setBody('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
    onError: () => setError('Could not send. Check your connection and try again.'),
  });

  return (
    <section className="tile mb-6">
      <h2 className="mb-3 font-semibold">Send an announcement</h2>

      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="DCDF at capacity, ushers hold at Welcome Lounge."
        className="w-full rounded-lg border px-4 py-3"
        style={{ borderColor: 'var(--line)', background: 'var(--surface)', color: 'var(--text)' }}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {(['INFO', 'OPERATIONAL', 'URGENT'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setPriority(option)}
            aria-pressed={priority === option}
            className="rounded-full border px-4 py-2 text-sm"
            style={{
              minHeight: 44,
              borderColor: priority === option ? 'var(--color-primary)' : 'var(--line)',
              background: priority === option ? 'var(--color-primary)' : 'var(--surface)',
              color: priority === option ? 'var(--color-on-primary)' : 'var(--text)',
            }}
          >
            {option === 'INFO'
              ? 'Information'
              : option === 'OPERATIONAL'
                ? 'Operational'
                : 'Urgent'}
          </button>
        ))}
      </div>

      {priority === 'URGENT' ? (
        <p className="mt-2 text-sm" style={{ color: 'var(--color-warn)' }}>
          Urgent is the only priority that pushes to phones. Use it sparingly — volunteers who get
          forty pushes stop reading them.
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={requiresAck}
            onChange={(event) => setRequiresAck(event.target.checked)}
          />
          Ask for acknowledgement
        </label>

        {canSendEventWide ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={eventWide}
              onChange={(event) => setEventWide(event.target.checked)}
            />
            Send to the whole event
          </label>
        ) : null}

        {!eventWide ? (
          <select
            value={stationId}
            onChange={(event) => setStationId(event.target.value)}
            className="rounded-lg border px-4 py-3"
            style={{
              borderColor: 'var(--line)',
              background: 'var(--surface)',
              color: 'var(--text)',
              minHeight: 48,
            }}
          >
            <option value="">
              {me?.currentAssignment
                ? `My station (${me.currentAssignment.station.name})`
                : 'Choose a station…'}
            </option>
            {(stations.data ?? []).map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-2" style={{ color: 'var(--color-alert)' }}>
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="pill mt-4"
        disabled={body.trim().length < 3 || send.isPending}
        onClick={() => send.mutate()}
      >
        {send.isPending ? 'Sending…' : 'Send'}
      </button>
    </section>
  );
}
