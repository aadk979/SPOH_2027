'use client';

import { Composer } from '../components/Composer';
import { PRIORITY_LABELS, PRIORITY_TONE, type Priority } from '../model/priority';

import { type ReactNode } from 'react';

import { AppShell } from '@/shared/shell/AppShell';
import { Button, Card, EmptyState, LoadingRows, Section, Stack } from '@/shared/ui';
import { useMe, useRequireSession } from '@/features/session';
import { useAnnouncements, useAcknowledgeAnnouncement } from '@/features/announcements';
import { formatTime } from '@/shared/lib/format';

/**
 * The announcements inbox (remediation/phases/P07-client-refactor.md).
 *
 * Quiet by default: everything lands here, and only URGENT is eligible for a
 * push. Volunteers who receive forty pushes stop reading pushes by 11am, and
 * then the one that matters is the one they miss.
 */

export default function InboxScreen(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();

  const inbox = useAnnouncements(session !== null);
  const acknowledge = useAcknowledgeAnnouncement();

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
                    {/* Priority is a word, not a colour (remediation/standards/engineering-standards.md). */}
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
