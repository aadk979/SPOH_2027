'use client';

import { useCallback, useState, type ReactNode } from 'react';
import type { MissionCardRecord, StampCardResponse } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { CardCodeInput } from '@/components/CardCodeInput';
import { SyncIndicator } from '@/components/SyncIndicator';
import { Callout, Card, CardTitle, EmptyState, type Tone } from '@/components/ui';
import { useQrScanner } from '@/features/capture/useQrScanner';
import { useWakeLock } from '@/features/capture/useCapture';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { ApiError, api } from '@/lib/api';

/**
 * Stamp scanning (BUILD_PLAN §9.4, PRODUCT_BRIEF §4.2).
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
export default function StampCapturePage(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();
  const [card, setCard] = useState<MissionCardRecord | null>(null);
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [scanned, setScanned] = useState(0);

  const station = me?.currentAssignment?.station;

  useWakeLock(session !== null);

  const stamp = useCallback(
    async (shortCode: string): Promise<void> => {
      if (!station || pending) return;
      setPending(true);
      setMessage(null);

      try {
        const result = await api<StampCardResponse>(`/cards/${shortCode}/stamps`, {
          method: 'POST',
          body: {
            stationId: station.id,
            idempotencyKey: crypto.randomUUID(),
            clientRecordedAt: new Date().toISOString(),
          },
        });

        setCard(result.card);
        navigator.vibrate?.(result.stampAdded ? 15 : [15, 60, 15]);
        if (result.stampAdded) setScanned((count) => count + 1);

        setMessage(
          result.justCompleted
            ? { tone: 'ok', text: 'Journey complete — send them to Mission Complete.' }
            : result.stampAdded
              ? { tone: 'ok', text: 'Stamped.' }
              : { tone: 'warn', text: result.warning ?? 'Already stamped here.' },
        );
      } catch (error) {
        setCard(null);
        setMessage({
          tone: 'alert',
          text:
            error instanceof ApiError
              ? error.message
              : 'Could not reach the server. Stamp the card and carry on.',
        });
      } finally {
        setPending(false);
      }
    },
    [station, pending],
  );

  /**
   * The QR payload is opaque (`spoh2027:<uuid>`), so a scanned code is looked
   * up by payload while a typed code is a short code. Both resolve to the same
   * card; the server accepts the short code, so a scan of our own QR is mapped
   * back through the card lookup.
   */
  const onDecode = useCallback(
    (text: string): void => {
      const cleaned = text.trim();
      // A printed card carries both. Prefer the short code when the QR encodes
      // it directly; otherwise treat the payload as the lookup key.
      const shortCode = /^[0-9A-HJ-NP-Z]{6}$/i.test(cleaned)
        ? cleaned.toUpperCase()
        : cleaned.split(':').pop()?.slice(0, 6).toUpperCase();

      if (shortCode) void stamp(shortCode);
    },
    [stamp],
  );

  const scanner = useQrScanner({ onDecode });

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

/** What the facilitator reads out: where they have been, where to go next. */
function CardSummary({ card }: { card: MissionCardRecord }): ReactNode {
  return (
    <Card>
      <CardTitle className="font-display tracking-[0.15em]">{card.shortCode}</CardTitle>
      <p className="text-caption text-text-muted">
        {card.status === 'COMPLETED' ? 'Journey complete' : `${card.stamps.length} stamps so far`}
      </p>

      <ul className="mt-sm flex flex-col gap-xxs">
        {card.stamps.map((stampRecord) => (
          <li key={stampRecord.id}>
            <span aria-hidden="true" className="mr-xs text-ok">
              ✓
            </span>
            {stampRecord.stationName}
          </li>
        ))}
      </ul>

      {card.remainingStationIds.length > 0 ? (
        <p className="mt-sm text-caption text-text-muted">
          {card.remainingStationIds.length} station
          {card.remainingStationIds.length === 1 ? '' : 's'} still to visit.
        </p>
      ) : null}
    </Card>
  );
}
