'use client';

import { type ReactNode } from 'react';
import { CardSummary } from '../components/CardSummary';
import { useStampCapture } from '../hooks/useStampCapture';
import { AppShell } from '@/shared/shell/AppShell';
import { CardCodeInput } from '@/features/capture';
import { SyncIndicator } from '@/shared/shell/SyncIndicator';
import { Callout, EmptyState } from '@/shared/ui';
import { useWakeLock } from '@/shared/hooks/useWakeLock';
import { useRequireSession } from '@/features/session';

/**
 * Stamp scanning (remediation/phases/P07-client-refactor.md).
 *
 * The facilitator stamps the card physically first, then scans. The physical
 * stamp is the keepsake and stays authoritative; this records the journey so
 * the funnel exists at all.
 *
 * Sent directly rather than through the outbox: the facilitator needs to see
 * the card's existing stamps to tell the visitor where to go next, and a queued
 * write cannot answer that. If the send fails, the physical stamp is already on
 * the card and only the journey data for that scan is lost — which the brief
 * accepts explicitly (§4.3).
 */
export default function StampCaptureScreen(): ReactNode {
  const session = useRequireSession();
  const { station, card, message, pending, scanned, stamp, scanner } = useStampCapture();
  useWakeLock(session !== null);

  if (!session) return null;

  if (!station?.issuesStamp) {
    return (
      <AppShell title="Stamp a card" back={{ href: '/home', label: 'Home' }}>
        <EmptyState title="Scanning is closed here">
          {station
            ? `${station.name} does not stamp Mission Cards.`
            : 'You are not on shift right now.'}
        </EmptyState>
      </AppShell>
    );
  }

  return (
    <AppShell
      width="capture"
      title={`Stamp — ${station.name}`}
      back={{ href: '/home', label: 'Home' }}
      actions={<SyncIndicator />}
    >
      <div className="flex flex-col gap-md">
        <p className="text-caption text-text-muted">
          Stamp the card by hand first. The scan records the journey — it is not what the visitor
          takes home. <strong>{scanned}</strong> stamped this session.
        </p>

        <CardCodeInput
          videoRef={scanner.videoRef}
          scannerState={scanner.state}
          onSubmitCode={(code) => void stamp(code)}
          pending={pending}
        />

        {message ? (
          <Callout tone={message.tone} role="status">
            <span className="font-semibold">{message.text}</span>
          </Callout>
        ) : null}

        {card ? <CardSummary card={card} /> : null}
      </div>
    </AppShell>
  );
}
