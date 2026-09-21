'use client';

import { useState, type ReactNode } from 'react';
import { AlertDelivery } from '@/components/AlertDelivery';
import { AppShell } from '@/components/AppShell';
import { useOutboxEntries } from '@/components/SyncIndicator';
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  Section,
  Stack,
  StatusText,
} from '@/components/ui';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { blockLabel, formatTime } from '@/lib/format';
import { flush, toClipboardText } from '@/lib/outbox';

/**
 * My shift, plus the sync diagnostics panel (BUILD_PLAN §9.5).
 *
 * The diagnostics half is the important part. When taps have failed for good,
 * an IC needs to be able to get the counts out of the phone and into the
 * fallback sheet — a failed capture should be recoverable, not merely visible.
 * Copying them as tab-separated text pastes straight into a Google Sheet.
 */
export default function ShiftPage(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();
  const entries = useOutboxEntries();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  if (!session) return null;

  const failed = entries.filter((entry) => entry.status === 'failed');
  const pending = entries.filter((entry) => entry.status !== 'failed');

  async function copyFailed(): Promise<void> {
    try {
      await navigator.clipboard.writeText(toClipboardText(failed));
      setCopyError(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Clipboard access can be refused (iOS Safari, an unfocused tab). This
      // is the moment an IC is salvaging failed captures during an outage —
      // it must say so rather than quietly do nothing.
      setCopied(false);
      setCopyError(true);
    }
  }

  return (
    <AppShell title="My shift" back={{ href: '/home', label: 'Home' }}>
      <Stack>
        <Section title="Attendance" description="Verify your presence with your admin or exco.">
          <ButtonLink href="/attendance">Submit attendance / verify team</ButtonLink>
        </Section>
        <Section title="Shifts">
          {me && me.upcomingAssignments.length > 0 ? (
            <ul className="flex flex-col gap-xs">
              {me.upcomingAssignments.map((assignment) => (
                <Card as="li" variant="flat" key={assignment.id}>
                  <p className="font-semibold">{assignment.station.name}</p>
                  <p className="text-caption text-text-muted">
                    {assignment.dayLabel} · {blockLabel(assignment.block)} · {assignment.roleLabel}
                  </p>
                  {assignment.checkedInAt ? (
                    <StatusText tone="ok" className="mt-xxs block">
                      <span aria-hidden="true">✓ </span>
                      Checked in {formatTime(assignment.checkedInAt)}
                    </StatusText>
                  ) : null}
                </Card>
              ))}
            </ul>
          ) : (
            <EmptyState title="No shifts assigned yet">
              Your IC assigns shifts from the roster. Check with them if the event has started.
            </EmptyState>
          )}
        </Section>

        <Section title="Alerts" description="Whether this phone can reach you with the app closed.">
          <AlertDelivery />
        </Section>

        <Section title="Sync">
          {entries.length === 0 ? (
            <Callout tone="ok">Everything you have captured has reached the server.</Callout>
          ) : (
            <Card variant="flat">
              <p>
                <strong>{pending.length}</strong> waiting to send, <strong>{failed.length}</strong>{' '}
                could not be sent.
              </p>

              <div className="mt-md flex flex-wrap gap-sm">
                <Button onClick={() => void flush({ force: true })}>Try again now</Button>

                {failed.length > 0 ? (
                  <Button variant="quiet" onClick={() => void copyFailed()}>
                    {copied ? 'Copied ✓' : 'Copy failed captures'}
                  </Button>
                ) : null}
              </div>

              {copyError ? (
                <Callout tone="alert" role="alert" className="mt-md">
                  Could not copy automatically. Select the list below by hand and copy it instead.
                </Callout>
              ) : null}

              {failed.length > 0 ? (
                <>
                  <p className="mt-lg text-caption text-text-muted">
                    Give these to your IC to enter on the fallback sheet. They paste straight into a
                    spreadsheet.
                  </p>

                  {/*
                    Scrolls inside itself. An hour of failed taps is hundreds of
                    rows, and letting them run down the page buries the "Try
                    again" button the volunteer came here to press.
                  */}
                  <ul className="mt-xs flex max-h-[40dvh] flex-col gap-xxs overflow-y-auto text-caption text-text-muted">
                    {failed.map((entry) => (
                      <li key={entry.id}>
                        {formatTime(entry.clientRecordedAt)} · {entry.endpoint} · {entry.attempts}{' '}
                        attempts · {entry.lastError ?? 'unknown error'}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Card>
          )}
        </Section>
      </Stack>
    </AppShell>
  );
}
