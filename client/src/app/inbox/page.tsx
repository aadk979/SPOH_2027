'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { AnnouncementRecord, StationSummary } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import {
  Button,
  Callout,
  Card,
  Checkbox,
  ChoiceGroup,
  EmptyState,
  Field,
  LoadingRows,
  Section,
  Select,
  Stack,
  Textarea,
  type CardTone,
} from '@/components/ui';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/format';

/**
 * The announcements inbox (PRODUCT_BRIEF §8).
 *
 * Quiet by default: everything lands here, and only URGENT is eligible for a
 * push. Volunteers who receive forty pushes stop reading pushes by 11am, and
 * then the one that matters is the one they miss.
 */
const INBOX_POLL_MS = 30_000;

type Priority = 'INFO' | 'OPERATIONAL' | 'URGENT';

const PRIORITY_LABELS: Record<Priority, string> = {
  INFO: 'Information',
  OPERATIONAL: 'Operational',
  URGENT: 'Urgent',
};

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
    <AppShell width="reading" title="Announcements" back={{ href: '/home', label: 'Home' }}>
      <Stack>
        {canSend ? <Composer me={me} /> : null}

        <Section title="Your messages">
          {inbox.isLoading ? (
            <LoadingRows count={3} label="Loading announcements" />
          ) : announcements.length === 0 ? (
            <EmptyState title="Nothing yet">
              Messages from your IC and from the Chief land here. Only urgent ones push to your
              phone.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-sm">
              {announcements.map((announcement) => (
                <Card
                  as="li"
                  key={announcement.id}
                  tone={PRIORITY_TONE[announcement.priority as Priority] ?? 'neutral'}
                >
                  <p className="text-fine font-semibold tracking-[0.06em] text-text-muted uppercase">
                    {/* Priority is a word, not a colour (BUILD_PLAN §9.7). */}
                    {PRIORITY_LABELS[announcement.priority as Priority] ?? announcement.priority}
                    {announcement.targetStationName ? ` · ${announcement.targetStationName}` : ''}
                  </p>

                  <p className="mt-xs text-reading">{announcement.body}</p>

                  <p className="mt-xs text-caption text-text-muted">
                    {announcement.authorName} · {formatTime(announcement.createdAt)}
                    {announcement.requiresAck ? ` · ${announcement.ackCount} acknowledged` : ''}
                  </p>

                  {announcement.requiresAck ? (
                    <Button
                      variant={announcement.ackedByMe ? 'quiet' : 'primary'}
                      className="mt-sm"
                      disabled={announcement.ackedByMe || acknowledge.isPending}
                      onClick={() => acknowledge.mutate(announcement.id)}
                    >
                      {announcement.ackedByMe ? 'Acknowledged ✓' : 'Acknowledge'}
                    </Button>
                  ) : null}
                </Card>
              ))}
            </ul>
          )}
        </Section>
      </Stack>
    </AppShell>
  );
}

/** Urgent gets the rail; the other two do not need one to be found. */
const PRIORITY_TONE: Record<Priority, CardTone> = {
  URGENT: 'alert',
  OPERATIONAL: 'neutral',
  INFO: 'neutral',
};

/** IC and above. Station-targeted by default; event-wide needs a DC. */
function Composer({ me }: { me: ReturnType<typeof useMe>['data'] }): ReactNode {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('OPERATIONAL');
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
    <Card as="section" className="flex flex-col gap-md">
      <h2 className="text-tagline">Send an announcement</h2>

      <Field id="announcement-body" label="Message" error={error}>
        {(props) => (
          <Textarea
            {...props}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="DCDF at capacity, ushers hold at Welcome Lounge."
          />
        )}
      </Field>

      <ChoiceGroup
        legend="Priority"
        name="announcement-priority"
        value={priority}
        onChange={setPriority}
        options={[
          { value: 'INFO', label: PRIORITY_LABELS.INFO },
          { value: 'OPERATIONAL', label: PRIORITY_LABELS.OPERATIONAL },
          { value: 'URGENT', label: PRIORITY_LABELS.URGENT },
        ]}
      />

      {priority === 'URGENT' ? (
        <Callout tone="warn">
          Urgent is the only priority that pushes to phones. Use it sparingly — volunteers who get
          forty pushes stop reading them.
        </Callout>
      ) : null}

      <div className="flex flex-col">
        <Checkbox
          label="Ask for acknowledgement"
          checked={requiresAck}
          onChange={(event) => setRequiresAck(event.target.checked)}
        />

        {canSendEventWide ? (
          <Checkbox
            label="Send to the whole event"
            checked={eventWide}
            onChange={(event) => setEventWide(event.target.checked)}
          />
        ) : null}
      </div>

      {!eventWide ? (
        <Field id="announcement-station" label="Send to">
          {(props) => (
            <Select
              {...props}
              value={stationId}
              onChange={(event) => setStationId(event.target.value)}
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
            </Select>
          )}
        </Field>
      ) : null}

      <Button
        className="self-start"
        disabled={body.trim().length < 3 || send.isPending}
        onClick={() => send.mutate()}
      >
        {send.isPending ? 'Sending…' : 'Send'}
      </Button>
    </Card>
  );
}
